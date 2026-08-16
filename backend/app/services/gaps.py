"""Heuristic research-gap mining. Deterministic, grounded in real data."""
from __future__ import annotations

import json
import re
from collections import Counter

from sqlalchemy.orm import Session

from ..models import Paper, PaperTopic, ResearchGap, Topic

_FUTURE_RE = re.compile(
    r"(future work|future research|we leave|we plan to|limitation|remains an open|open problem"
    r"|remains open|we do not|currently lacks|not yet|unexplored|under-explored|underexplored"
    r"|challenging|challenge remains)",
    re.IGNORECASE,
)


def _topic_papers(db: Session, topic_id: int) -> list[Paper]:
    return (
        db.query(Paper)
        .join(PaperTopic, PaperTopic.paper_id == Paper.id)
        .filter(PaperTopic.topic_id == topic_id)
        .all()
    )


def _add_gap(
    db: Session,
    project_id: int,
    *,
    title: str,
    problem: str,
    why_worth: str,
    existing_methods: list[str],
    proposed_ideas: list[str],
    evidence: list[int],
    confidence: float,
    signal: str,
) -> None:
    db.add(
        ResearchGap(
            project_id=project_id,
            title=title,
            problem=problem,
            why_worth=why_worth,
            existing_methods=json.dumps(existing_methods, ensure_ascii=False),
            proposed_ideas=json.dumps(proposed_ideas, ensure_ascii=False),
            evidence_paper_ids=json.dumps(evidence),
            confidence=round(confidence, 3),
            signal=signal,
        )
    )


def _extract_sentence(abstract: str) -> str | None:
    if not abstract:
        return None
    for s in re.split(r"(?<=[.!?])\s+", abstract):
        if _FUTURE_RE.search(s):
            return s.strip()
    return None


def run_gaps(db: Session, project_id: int) -> list[dict]:
    papers = db.query(Paper).filter(Paper.project_id == project_id).all()
    topics = db.query(Topic).filter(Topic.project_id == project_id).all()
    db.query(ResearchGap).filter(ResearchGap.project_id == project_id).delete()
    db.commit()

    if not papers:
        return []

    citations = [p.cited_by_count for p in papers]
    median_citation = sorted(citations)[len(citations) // 2]
    years = [p.publication_year for p in papers if p.publication_year]
    latest_year = max(years) if years else None

    topic_stats = {}
    for t in topics:
        tps = _topic_papers(db, t.id)
        if not tps:
            continue
        total = sum(p.cited_by_count for p in tps)
        top = max(tps, key=lambda p: p.cited_by_count)
        topic_stats[t] = {
            "papers": tps,
            "total_citations": total,
            "top_share": top.cited_by_count / total if total else 0.0,
            "mean_year": round(
                sum(p.publication_year for p in tps if p.publication_year)
                / max(1, sum(1 for p in tps if p.publication_year)),
                1,
            ),
        }

    # ---- signal 1: future_work ----
    fw_count = 0
    for p in papers[:20]:
        sent = _extract_sentence(p.abstract or "")
        if not sent:
            continue
        topic_names = _paper_topic_names(db, p.id)
        existing = _topic_top_paper_titles(db, topic_names)
        _add_gap(
            db,
            project_id,
            title=f"Open direction flagged in: {p.title[:90]}",
            problem=(
                f'The paper "{p.title}" states: "{sent}" This explicit gap or limitation has not '
                "been systematically addressed within the collected corpus."
            ),
            why_worth=(
                "Directions authors themselves identify as future work are high-value targets: they "
                "are concrete, grounded in real experiments, and validated by domain experts."
            ),
            existing_methods=existing[:4] or ["No directly comparable method identified in corpus."],
            proposed_ideas=[
                "Design a method that directly targets the stated limitation and benchmark it against the original paper's setting.",
                "Survey recent works citing this paper to check whether the gap has been partially closed.",
                "Reformulate the limitation as a measurable research question and prototype a minimal solution.",
            ],
            evidence=[p.id],
            confidence=0.7,
            signal="future_work",
        )
        fw_count += 1
        if fw_count >= 3:
            break

    # ---- signal 2: undercited_recent ----
    if latest_year is not None:
        recent = [
            p
            for p in papers
            if p.publication_year and p.publication_year >= latest_year - 1 and p.cited_by_count <= median_citation
        ]
        by_topic: Counter = Counter()
        recent_by_topic: dict[str, list[Paper]] = {}
        for p in recent:
            for name in _paper_topic_names(db, p.id):
                by_topic[name] += 1
                recent_by_topic.setdefault(name, []).append(p)
        for name, count in by_topic.most_common(3):
            if count < 2:
                continue
            rps = recent_by_topic[name][:3]
            _add_gap(
                db,
                project_id,
                title=f"Emerging but under-validated direction: {name}",
                problem=(
                    f"{count} recent papers in \"{name}\" still sit below the corpus median citation "
                    f"count ({median_citation}), suggesting the direction is nascent and not yet "
                    "independently validated."
                ),
                why_worth=(
                    "Early, low-citation work in an active area often marks a window where a strong "
                    "contribution can define the sub-field before it consolidates."
                ),
                existing_methods=[f'"{p.title}"' for p in rps],
                proposed_ideas=[
                    "Reproduce and stress-test these early methods across multiple environments to establish robustness.",
                    "Identify the shared assumption among these works and relax it to widen applicability.",
                    "Publish a unifying benchmark that formalizes evaluation for this sub-direction.",
                ],
                evidence=[p.id for p in rps],
                confidence=0.55,
                signal="undercited_recent",
            )

    # ---- signal 3: topic_intersection ----
    hot_topics = [t for t, s in sorted(topic_stats.items(), key=lambda kv: -len(kv[1]["papers"]))[:8]]
    for i in range(len(hot_topics)):
        for j in range(i + 1, len(hot_topics)):
            a, b = hot_topics[i], hot_topics[j]
            ids_a = {p.id for p in topic_stats[a]["papers"]}
            ids_b = {p.id for p in topic_stats[b]["papers"]}
            overlap = ids_a & ids_b
            if len(overlap) <= 1:
                _add_gap(
                    db,
                    project_id,
                    title=f"Underexplored intersection: {a.name} × {b.name}",
                    problem=(
                        f'"{a.name}" and "{b.name}" are each active directions, yet almost no papers '
                        f"in the corpus combine them (overlap: {len(overlap)})."
                    ),
                    why_worth=(
                        "The sparse intersection of two established lines often hides composable ideas "
                        "that neither community has tried."
                    ),
                    existing_methods=_topic_top_paper_titles(db, [a.name, b.name]),
                    proposed_ideas=[
                        f"Combine techniques from {a.name} with {b.name} and evaluate on a shared benchmark.",
                        "Study why the two communities have not intersected (evaluation, data, or assumptions).",
                    ],
                    evidence=list(overlap)[:3],
                    confidence=0.5,
                    signal="topic_intersection",
                )
                break
        else:
            continue
        break

    # ---- signal 4: single_dominant ----
    for t, s in topic_stats.items():
        if len(s["papers"]) >= 3 and s["top_share"] > 0.6:
            top = max(s["papers"], key=lambda p: p.cited_by_count)
            _add_gap(
                db,
                project_id,
                title=f"Thin field dominated by a single method: {t.name}",
                problem=(
                    f'In "{t.name}", the single most-cited paper ("{top.title}") accounts for '
                    f"{round(s['top_share'] * 100)}% of the topic's citations, indicating a thin "
                    "field with one dominant approach."
                ),
                why_worth=(
                    "Fields with one dominant method are fertile for alternatives: the dominant "
                    "method's assumptions are rarely re-examined."
                ),
                existing_methods=[f'"{top.title}" ({top.cited_by_count} citations)'],
                proposed_ideas=[
                    "Systematically enumerate the assumptions of the dominant method and target the weakest one.",
                    "Build a competitive but conceptually different baseline to expose failure modes.",
                ],
                evidence=[top.id],
                confidence=0.6,
                signal="single_dominant",
            )
            break

    # ---- signal 5: mature_decline ----
    for t, s in sorted(topic_stats.items(), key=lambda kv: -kv[1]["total_citations"])[:5]:
        if s["total_citations"] >= 10 and s["mean_year"] and latest_year and s["mean_year"] < latest_year - 2:
            _add_gap(
                db,
                project_id,
                title=f"Mature area due for revisit: {t.name}",
                problem=(
                    f'"{t.name}" has accumulated {s["total_citations"]} citations but its mean '
                    f"publication year ({s['mean_year']}) predates the current frontier "
                    f"({latest_year}), suggesting recent attention has moved elsewhere."
                ),
                why_worth=(
                    "Mature methods are well understood and cheap to re-evaluate against modern "
                    "compute, data, and baselines — a reliable route to solid contributions."
                ),
                existing_methods=_topic_top_paper_titles(db, [t.name]),
                proposed_ideas=[
                    f"Revisit {t.name} with modern evaluation protocols and report where it still holds.",
                    "Apply the mature technique to a frontier problem as a strong, simple baseline.",
                ],
                evidence=[p.id for p in sorted(s["papers"], key=lambda p: -p.cited_by_count)[:3]],
                confidence=0.45,
                signal="mature_decline",
            )
            break

    db.commit()
    return serialize_gaps(db, project_id)


def _paper_topic_names(db: Session, paper_id: int) -> list[str]:
    return [
        t.name
        for t in db.query(Topic)
        .join(PaperTopic, PaperTopic.topic_id == Topic.id)
        .filter(PaperTopic.paper_id == paper_id)
        .all()
    ]


def _topic_top_paper_titles(db: Session, topic_names: list[str]) -> list[str]:
    if not topic_names:
        return []
    ids = (
        db.query(Topic.id).filter(Topic.name.in_(topic_names)).all()
    )
    id_list = [i for (i,) in ids]
    papers = (
        db.query(Paper)
        .join(PaperTopic, PaperTopic.paper_id == Paper.id)
        .filter(PaperTopic.topic_id.in_(id_list))
        .order_by(Paper.cited_by_count.desc())
        .limit(6)
        .all()
    )
    return [f'"{p.title}"' for p in papers]


def serialize_gaps(db: Session, project_id: int) -> list[dict]:
    gaps = (
        db.query(ResearchGap)
        .filter(ResearchGap.project_id == project_id)
        .order_by(ResearchGap.confidence.desc())
        .all()
    )
    out = []
    for g in gaps:
        evidence_ids = json.loads(g.evidence_paper_ids or "[]")
        evidence = [db.get(Paper, pid) for pid in evidence_ids]
        out.append(
            {
                "id": g.id,
                "title": g.title,
                "problem": g.problem,
                "why_worth": g.why_worth,
                "existing_methods": json.loads(g.existing_methods or "[]"),
                "proposed_ideas": json.loads(g.proposed_ideas or "[]"),
                "evidence_papers": [
                    {"id": p.id, "title": p.title, "cited_by_count": p.cited_by_count, "publication_year": p.publication_year}
                    for p in evidence if p is not None
                ],
                "confidence": g.confidence,
                "signal": g.signal,
                "created_at": g.created_at.isoformat() if g.created_at else None,
            }
        )
    return out

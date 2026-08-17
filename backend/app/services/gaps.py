"""Heuristic research-gap mining. Deterministic, grounded in real data.

Prose is generated in both English and Chinese so the frontend language
toggle can switch the full gap cards.
"""
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
    title_zh: str | None = None,
    problem_zh: str | None = None,
    why_worth_zh: str | None = None,
    existing_methods_zh: list[str] | None = None,
    proposed_ideas_zh: list[str] | None = None,
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
            title_zh=title_zh,
            problem_zh=problem_zh,
            why_worth_zh=why_worth_zh,
            existing_methods_zh=json.dumps(existing_methods_zh, ensure_ascii=False) if existing_methods_zh is not None else None,
            proposed_ideas_zh=json.dumps(proposed_ideas_zh, ensure_ascii=False) if proposed_ideas_zh is not None else None,
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
            title_zh=f"论文指出的开放方向：{p.title[:90]}",
            problem_zh=(
                f'论文《{p.title}》指出："{sent}" 这一明确的缺口/局限，在语料库中'
                "尚未被系统性地解决。"
            ),
            why_worth_zh=(
                "作者本人指出的未来工作方向是高价值目标：具体、基于真实实验、"
                "并且经过领域专家的验证。"
            ),
            existing_methods_zh=existing[:4] or ["语料库中未发现直接可比的方案。"],
            proposed_ideas_zh=[
                "设计一个直接针对该局限的方法，并在原论文的实验设定下进行基准对比。",
                "调研引用了这篇论文的近期工作，检查该缺口是否已被部分填补。",
                "把该局限改写成可度量的研究问题，并实现一个最小可行方案。",
            ],
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
                title_zh=f"新兴但验证不足的方向：{name}",
                problem_zh=(
                    f'"{name}" 方向的 {count} 篇近期论文引用数仍低于语料中位数'
                    f"（{median_citation}），说明该方向尚处萌芽阶段、尚未被独立验证。"
                ),
                why_worth_zh=(
                    "活跃领域中早期、低被引的工作往往意味着一个窗口期："
                    "在子领域定型之前，扎实的贡献可以定义它。"
                ),
                existing_methods_zh=[f"《{p.title}》" for p in rps],
                proposed_ideas_zh=[
                    "在多个环境中复现并压力测试这些早期方法，以建立鲁棒性。",
                    "找出这些工作共有的假设并放宽它，以扩大适用范围。",
                    "发布统一的基准测试，为该子方向规范评估方式。",
                ],
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
                    title_zh=f"未被探索的交叉方向：{a.name} × {b.name}",
                    problem_zh=(
                        f'"{a.name}" 与 "{b.name}" 各自活跃，但语料中几乎没有论文'
                        f"同时涉及两者（重叠：{len(overlap)} 篇）。"
                    ),
                    why_worth_zh=(
                        "两条成熟路线之间稀少的交叉点，往往隐藏着两边社区都未尝试过的可组合思路。"
                    ),
                    existing_methods_zh=_topic_top_paper_titles(db, [a.name, b.name]),
                    proposed_ideas_zh=[
                        f"将 {a.name} 的技术与 {b.name} 结合，并在统一的基准上评估。",
                        "研究两个社区为何没有交叉（评估方式、数据或假设的差异）。",
                    ],
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
                title_zh=f"由单一方法主导的薄弱领域：{t.name}",
                problem_zh=(
                    f'在 "{t.name}" 中，被引最高的论文（《{top.title}》）占据了该方向'
                    f"{round(s['top_share'] * 100)}% 的引用，说明该领域方法单一、"
                    "由一种主导方案垄断。"
                ),
                why_worth_zh=(
                    "由单一方法主导的领域是孕育替代方案的沃土：主导方法的假设很少被重新审视。"
                ),
                existing_methods_zh=[f"《{top.title}》（{top.cited_by_count} 次被引）"],
                proposed_ideas_zh=[
                    "系统性地列出主导方法的假设，并针对最薄弱的一条展开研究。",
                    "构建一个有竞争力但思路不同的基线，暴露其失效模式。",
                ],
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
                title_zh=f"值得重新审视的成熟领域：{t.name}",
                problem_zh=(
                    f'"{t.name}" 累计被引 {s["total_citations"]} 次，但其平均发表年份'
                    f"（{s['mean_year']}）早于当前前沿（{latest_year}），说明近期的关注已经转移。"
                ),
                why_worth_zh=(
                    "成熟方法已被充分理解，用现代算力、数据与基线重新评估成本低——"
                    "是一条通往扎实贡献的可靠路径。"
                ),
                existing_methods_zh=_topic_top_paper_titles(db, [t.name]),
                proposed_ideas_zh=[
                    f"用现代评估协议重新审视 {t.name}，并报告它仍然成立的场景。",
                    "把这项成熟技术应用到前沿问题上，作为一个强而简单的基线。",
                ],
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
                "title_zh": g.title_zh,
                "problem_zh": g.problem_zh,
                "why_worth_zh": g.why_worth_zh,
                "existing_methods_zh": json.loads(g.existing_methods_zh or "[]") if g.existing_methods_zh else None,
                "proposed_ideas_zh": json.loads(g.proposed_ideas_zh or "[]") if g.proposed_ideas_zh else None,
            }
        )
    return out

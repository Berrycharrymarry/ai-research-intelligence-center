"""Deterministic analytics: overview, trends, roadmap, landscape, timeline."""
from __future__ import annotations

import json
from collections import Counter

from sqlalchemy.orm import Session

from ..models import Analysis, Paper, PaperTopic, Topic
from ..serializers import paper_authors, paper_dict, topic_trend


def _papers(db: Session, project_id: int) -> list[Paper]:
    return db.query(Paper).filter(Paper.project_id == project_id).all()


def year_series(db: Session, project_id: int) -> list[dict]:
    rows = (
        db.query(Paper.publication_year)
        .filter(Paper.project_id == project_id, Paper.publication_year.isnot(None))
        .all()
    )
    counts: Counter = Counter()
    for (y,) in rows:
        counts[y] += 1
    return [{"year": y, "count": counts[y]} for y in sorted(counts)]


def timeline_payload(db: Session, project_id: int) -> dict:
    series = year_series(db, project_id)
    years = [s["year"] for s in series]

    by_topic = []
    for t in db.query(Topic).filter(Topic.project_id == project_id).all():
        trend = topic_trend(db, project_id, t.id)
        if trend:
            by_topic.append({"topic": t.name, "series": trend})
    by_topic.sort(key=lambda x: -sum(s["count"] for s in x["series"]))

    milestones = []
    for y in years:
        p = (
            db.query(Paper)
            .filter(Paper.project_id == project_id, Paper.publication_year == y)
            .order_by(Paper.cited_by_count.desc())
            .first()
        )
        if p is not None:
            milestones.append(
                {"year": y, "title": p.title, "citations": p.cited_by_count, "paper_id": p.id}
            )

    return {"years": years, "series": series, "by_topic": by_topic[:10], "milestones": milestones}


def topic_summaries(db: Session, project_id: int) -> list[dict]:
    topics = db.query(Topic).filter(Topic.project_id == project_id).all()
    out = []
    for t in topics:
        papers = (
            db.query(Paper)
            .join(PaperTopic, PaperTopic.paper_id == Paper.id)
            .filter(PaperTopic.topic_id == t.id, Paper.project_id == project_id)
            .all()
        )
        if not papers:
            continue
        citations = sum(p.cited_by_count for p in papers)
        years = [p.publication_year for p in papers if p.publication_year]
        mean_year = round(sum(years) / len(years), 1) if years else None
        author_counts: Counter = Counter()
        for p in papers:
            for a in paper_authors(db, p.id):
                author_counts[a["name"]] += 1
        top_authors = [n for n, _ in author_counts.most_common(5)]
        top_papers = sorted(papers, key=lambda p: p.cited_by_count, reverse=True)[:3]
        out.append(
            {
                "id": t.id,
                "name": t.name,
                "kind": t.kind,
                "description": t.description,
                "paper_count": len(papers),
                "total_citations": citations,
                "mean_year": mean_year,
                "top_authors": top_authors,
                "top_papers": [paper_dict(db, p) for p in top_papers],
                "trend": topic_trend(db, project_id, t.id),
            }
        )
    out.sort(key=lambda x: -x["paper_count"])
    return out


def growth_rates(db: Session, project_id: int) -> dict[str, float]:
    rates: dict[str, float] = {}
    years = [s["year"] for s in year_series(db, project_id)]
    if not years:
        return rates
    latest = max(years)
    recent_years = {latest - 1, latest}
    prior_years = {latest - 3, latest - 2}
    for t in db.query(Topic).filter(Topic.project_id == project_id).all():
        trend = topic_trend(db, project_id, t.id)
        recent = sum(s["count"] for s in trend if s["year"] in recent_years)
        prior = sum(s["count"] for s in trend if s["year"] in prior_years)
        if prior > 0:
            rates[t.name] = round((recent - prior) / prior, 3)
        elif recent > 0:
            rates[t.name] = 1.0
    return rates


def run_analysis(db: Session, project_id: int) -> dict:
    """Compute and persist overview/trends/roadmap/landscape. Idempotent."""
    papers = _papers(db, project_id)
    series = year_series(db, project_id)
    landscape = topic_summaries(db, project_id)
    growth = growth_rates(db, project_id)

    # ---- overview ----
    valid_years = sorted({p.publication_year for p in papers if p.publication_year})
    years_span = [valid_years[0], valid_years[-1]] if valid_years else None
    native = [p for p in papers if (p.kind or "search") != "expand"] or papers
    top_papers = sorted(native, key=lambda p: p.cited_by_count, reverse=True)[:5]
    inst_counter: Counter = Counter()
    for p in papers:
        for a in paper_authors(db, p.id):
            if a["institution"]:
                inst_counter[a["institution"]] += 1
    top_institutions = [n for n, _ in inst_counter.most_common(8)]
    top_topic_names = [t["name"] for t in landscape[:6]]

    summary_parts = [
        f"This corpus contains {len(papers)} papers"
        + (f" published between {years_span[0]} and {years_span[1]}" if years_span else "")
        + ".",
    ]
    if top_topic_names:
        summary_parts.append(
            "The dominant research directions are " + ", ".join(top_topic_names[:-1])
            + (f", and {top_topic_names[-1]}" if len(top_topic_names) > 1 else "")
            + "."
        )
    if top_papers:
        most_cited = top_papers[0]
        summary_parts.append(
            f"The most-cited work is \"{most_cited.title}\" ({most_cited.cited_by_count} citations)."
        )
    if top_institutions:
        summary_parts.append("Leading institutions include " + ", ".join(top_institutions[:4]) + ".")

    # Chinese twin of the overview summary (topic/institution names are data and stay as-is).
    zh_parts = [
        f"该语料库包含 {len(papers)} 篇论文"
        + (f"，发表于 {years_span[0]} 至 {years_span[1]} 年" if years_span else "")
        + "。",
    ]
    if top_topic_names:
        zh_parts.append("主要研究方向为 " + "、".join(top_topic_names) + "。")
    if top_papers:
        most_cited = top_papers[0]
        zh_parts.append(
            f"被引最高的论文是《{most_cited.title}》（{most_cited.cited_by_count} 次被引）。"
        )
    if top_institutions:
        zh_parts.append("主要研究机构包括 " + "、".join(top_institutions[:4]) + "。")

    overview = {
        "summary": " ".join(summary_parts),
        "summary_zh": " ".join(zh_parts),
        "stats": {
            "papers": len(papers),
            "years_span": years_span,
            "top_topics": top_topic_names,
            "top_papers": [paper_dict(db, p) for p in top_papers],
            "top_institutions": top_institutions,
        },
    }

    # ---- trends ----
    growth_items = sorted(growth.items(), key=lambda kv: -kv[1])
    trends = {
        "series": series,
        "fastest_growing": [
            {"topic": name, "growth": g} for name, g in growth_items if g > 0.15
        ][:6],
        "declining": [{"topic": name, "growth": g} for name, g in growth_items if g < -0.15][:6],
    }

    # ---- roadmap ----
    phases = _roadmap(db, papers, project_id)

    # ---- persist (replace prior generation) ----
    db.query(Analysis).filter(Analysis.project_id == project_id).delete()
    generated_at = None
    for kind, title, content in [
        ("overview", "Domain overview", overview),
        ("trends", "Trend analysis", trends),
        ("roadmap", "Technical route roadmap", {"phases": phases}),
        ("landscape", "Research landscape", landscape),
    ]:
        a = Analysis(
            project_id=project_id,
            kind=kind,
            title=title,
            content=json.dumps(content, ensure_ascii=False),
            model="heuristic-v1",
        )
        db.add(a)
    db.commit()
    generated_at = db.query(Analysis).filter(Analysis.project_id == project_id).first().generated_at

    return {
        "overview": overview,
        "trends": trends,
        "roadmap": {"phases": phases},
        "landscape": landscape,
        "model": "heuristic-v1",
        "generated_at": generated_at.isoformat() if generated_at else None,
    }


def _roadmap(db: Session, papers: list[Paper], project_id: int) -> list[dict]:
    valid = sorted({p.publication_year for p in papers if p.publication_year})
    if not valid:
        return []
    if len(valid) == 1:
        return [{"phase": "frontier", "years": [valid[0], valid[0]], "description": "All papers in a single year.", "topics": [], "papers": [paper_dict(db, p) for p in sorted(papers, key=lambda p: -p.cited_by_count)[:5]]}]

    def bucket(year):
        if year <= valid[0] + (valid[-1] - valid[0]) / 3:
            return "foundational"
        if year <= valid[0] + 2 * (valid[-1] - valid[0]) / 3:
            return "growth"
        return "frontier"

    buckets = {"foundational": [], "growth": [], "frontier": []}
    for p in papers:
        if p.publication_year:
            buckets[bucket(p.publication_year)].append(p)

    labels = {
        "foundational": "Foundational work that established the field",
        "growth": "Rapid growth and method consolidation",
        "frontier": "Current frontier and recent directions",
    }
    labels_zh = {
        "foundational": "奠定领域基础的奠基性工作",
        "growth": "快速增长与方法收敛",
        "frontier": "当前前沿与近期方向",
    }
    phases = []
    for phase in ["foundational", "growth", "frontier"]:
        ps = buckets[phase]
        if not ps:
            continue
        years = sorted({p.publication_year for p in ps if p.publication_year})
        # dominant topics in this phase
        topic_counter: Counter = Counter()
        for p in ps:
            for pt in db.query(PaperTopic).filter(PaperTopic.paper_id == p.id).all():
                t = db.get(Topic, pt.topic_id)
                if t:
                    topic_counter[t.name] += 1
        phases.append(
            {
                "phase": phase,
                "years": [years[0], years[-1]] if years else None,
                "description": labels[phase],
                "description_zh": labels_zh[phase],
                "topics": [n for n, _ in topic_counter.most_common(6)],
                "papers": [paper_dict(db, p) for p in sorted(ps, key=lambda p: -p.cited_by_count)[:6]],
            }
        )
    return phases

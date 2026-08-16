"""Analysis, research-gaps, and dashboard endpoints."""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Analysis, Paper, PaperAuthor, Project, ResearchGap, Topic
from ..serializers import paper_dict, project_dict
from ..services.analysis import growth_rates, timeline_payload, topic_summaries, year_series
from ..services.gaps import serialize_gaps
from ..services.graph import build_graph

router = APIRouter(tags=["analysis"])


def _require_project(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    return project


def _analysis_bundle(db: Session, project_id: int) -> dict:
    rows = db.query(Analysis).filter(Analysis.project_id == project_id).all()
    by_kind = {r.kind: json.loads(r.content) for r in rows}
    generated_at = max((r.generated_at for r in rows), default=None)
    return {
        "overview": by_kind.get("overview"),
        "trends": by_kind.get("trends"),
        "roadmap": by_kind.get("roadmap"),
        "landscape": by_kind.get("landscape"),
        "model": "heuristic-v1",
        "generated_at": generated_at.isoformat() if generated_at else None,
    }


@router.get("/api/projects/{project_id}/analysis")
def get_analysis(project_id: int, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    return _analysis_bundle(db, project_id)


@router.get("/api/projects/{project_id}/analysis/trends")
def get_trends(project_id: int, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    bundle = _analysis_bundle(db, project_id)
    return bundle.get("trends") or {"series": [], "fastest_growing": [], "declining": []}


@router.get("/api/projects/{project_id}/gaps")
def list_gaps(project_id: int, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    return serialize_gaps(db, project_id)


@router.get("/api/projects/{project_id}/gaps/{gap_id}")
def get_gap(project_id: int, gap_id: int, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    gap = (
        db.query(ResearchGap)
        .filter(ResearchGap.id == gap_id, ResearchGap.project_id == project_id)
        .first()
    )
    if gap is None:
        raise HTTPException(404, "Research gap not found.")
    return next((g for g in serialize_gaps(db, project_id) if g["id"] == gap_id), None)


@router.get("/api/projects/{project_id}/overview")
def overview(project_id: int, db: Session = Depends(get_db)):
    project = _require_project(db, project_id)
    papers = db.query(Paper).filter(Paper.project_id == project_id).all()
    author_count = (
        db.query(func.count(func.distinct(PaperAuthor.author_id)))
        .join(Paper, Paper.id == PaperAuthor.paper_id)
        .filter(Paper.project_id == project_id)
        .scalar()
    )
    topic_count = db.query(func.count(Topic.id)).filter(Topic.project_id == project_id).scalar()
    gap_count = (
        db.query(func.count(ResearchGap.id)).filter(ResearchGap.project_id == project_id).scalar()
    )
    citations = sum(p.cited_by_count for p in papers)
    years = [p.publication_year for p in papers if p.publication_year]
    year_span = [min(years), max(years)] if years else None
    avg_citations = round(citations / len(papers), 2) if papers else 0.0

    growth = growth_rates(db, project_id)
    counts = {t["name"]: t["paper_count"] for t in topic_summaries(db, project_id)}
    trending_topics = [
        {"name": n, "growth": g, "count": counts.get(n, 0)}
        for n, g in sorted(growth.items(), key=lambda kv: -kv[1])[:6]
    ]

    latest = (
        db.query(Paper)
        .filter(Paper.project_id == project_id)
        .order_by(Paper.publication_date.desc(), Paper.id.desc())
        .limit(6)
        .all()
    )
    top = (
        db.query(Paper)
        .filter(Paper.project_id == project_id, (Paper.kind.is_(None)) | (Paper.kind != "expand"))
        .order_by(Paper.cited_by_count.desc())
        .limit(6)
        .all()
    )
    if not top:
        top = (
            db.query(Paper)
            .filter(Paper.project_id == project_id)
            .order_by(Paper.cited_by_count.desc())
            .limit(6)
            .all()
        )

    return {
        "project": project_dict(project),
        "stats": {
            "papers": len(papers),
            "authors": author_count or 0,
            "topics": topic_count or 0,
            "gaps": gap_count or 0,
            "citations": citations,
            "avg_citations": avg_citations,
            "year_span": year_span,
        },
        "activity": year_series(db, project_id),
        "trending_topics": trending_topics,
        "latest_papers": [paper_dict(db, p) for p in latest],
        "top_papers": [paper_dict(db, p) for p in top],
        "timeline": timeline_payload(db, project_id),
        "graph": build_graph(db, project_id, papers_limit=90, authors_limit=30, topics_limit=15),
        "gaps": serialize_gaps(db, project_id)[:5],
    }

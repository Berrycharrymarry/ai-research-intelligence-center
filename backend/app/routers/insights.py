"""Topics (landscape), timeline, and knowledge-graph endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Paper, PaperTopic, Project, Topic
from ..serializers import paper_dict
from ..services.analysis import timeline_payload, topic_summaries
from ..services.graph import build_graph

router = APIRouter(tags=["insights"])


def _require_project(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    return project


@router.get("/api/projects/{project_id}/topics")
def list_topics(project_id: int, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    return topic_summaries(db, project_id)


@router.get("/api/projects/{project_id}/topics/{topic_id}")
def get_topic(project_id: int, topic_id: int, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    topic = db.query(Topic).filter(Topic.id == topic_id, Topic.project_id == project_id).first()
    if topic is None:
        raise HTTPException(404, "Topic not found.")
    papers = (
        db.query(Paper)
        .join(PaperTopic, PaperTopic.paper_id == Paper.id)
        .filter(PaperTopic.topic_id == topic_id, Paper.project_id == project_id)
        .order_by(Paper.cited_by_count.desc())
        .all()
    )
    summary = next((t for t in topic_summaries(db, project_id) if t["id"] == topic_id), None)
    return {
        "id": topic.id,
        "name": topic.name,
        "kind": topic.kind,
        "description": topic.description,
        "summary": summary,
        "papers": [paper_dict(db, p) for p in papers],
    }


@router.get("/api/projects/{project_id}/timeline")
def timeline(project_id: int, db: Session = Depends(get_db)):
    _require_project(db, project_id)
    return timeline_payload(db, project_id)


@router.get("/api/projects/{project_id}/graph")
def graph(
    project_id: int,
    papers_limit: int = 120,
    authors_limit: int = 40,
    topics_limit: int = 15,
    db: Session = Depends(get_db),
):
    _require_project(db, project_id)
    return build_graph(
        db,
        project_id,
        papers_limit=max(10, min(300, papers_limit)),
        authors_limit=max(5, min(100, authors_limit)),
        topics_limit=max(5, min(50, topics_limit)),
    )

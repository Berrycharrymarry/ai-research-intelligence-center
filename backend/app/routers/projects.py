"""Project CRUD + collection trigger."""
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Paper, Project, Topic
from ..serializers import paper_dict, project_dict
from ..services.analysis import topic_summaries
from ..services.ingestion import collect as run_collect

router = APIRouter(tags=["projects"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "project"


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    query: str | None = None


@router.get("/api/projects")
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [project_dict(p) for p in projects]


@router.post("/api/projects", status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    name = body.name.strip()
    slug = _slugify(name)
    if db.query(Project).filter(Project.slug == slug).first():
        raise HTTPException(409, "A project with this name already exists.")
    project = Project(
        slug=slug,
        name=name,
        description=body.description,
        query=(body.query or name).strip(),
        status="created",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project_dict(project)


@router.get("/api/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    result = project_dict(project)
    result["top_topics"] = [
        {"id": t["id"], "name": t["name"], "kind": t["kind"], "paper_count": t["paper_count"]}
        for t in topic_summaries(db, project_id)[:6]
    ]
    latest = (
        db.query(Paper)
        .filter(Paper.project_id == project_id)
        .order_by(Paper.publication_date.desc(), Paper.id.desc())
        .limit(5)
        .all()
    )
    result["latest_papers"] = [paper_dict(db, p) for p in latest]
    return result


@router.post("/api/projects/{project_id}/collect", status_code=202)
def collect_project(
    project_id: int, background: BackgroundTasks, db: Session = Depends(get_db)
):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    if project.status in ("collecting", "analyzing"):
        raise HTTPException(409, "Collection is already in progress.")
    project.status = "collecting"
    project.error = None
    db.commit()
    background.add_task(run_collect, project_id)
    return {"status": "collecting"}


@router.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    # Remove orphaned authors (authors no longer referenced by any paper).
    db.query(Paper).filter(Paper.project_id == project_id).delete()
    db.query(Topic).filter(Topic.project_id == project_id).delete()
    db.delete(project)
    db.commit()
    return None

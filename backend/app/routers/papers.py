"""Paper Explorer + authors endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Author, Paper, PaperAuthor, PaperTopic, Project, Topic
from ..serializers import paper_dict

router = APIRouter(tags=["papers"])


@router.get("/api/projects/{project_id}/papers")
def list_papers(
    project_id: int,
    q: str | None = None,
    topic: str | None = None,
    sort: str = "date",
    order: str = "desc",
    year_from: int | None = None,
    year_to: int | None = None,
    min_citations: int | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    if db.get(Project, project_id) is None:
        raise HTTPException(404, "Project not found.")

    query = db.query(Paper).filter(Paper.project_id == project_id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Paper.title.ilike(like), Paper.abstract.ilike(like)))
    if topic:
        query = (
            query.join(PaperTopic, PaperTopic.paper_id == Paper.id)
            .join(Topic, Topic.id == PaperTopic.topic_id)
            .filter(Topic.name == topic)
        )
    if year_from is not None:
        query = query.filter(Paper.publication_year >= year_from)
    if year_to is not None:
        query = query.filter(Paper.publication_year <= year_to)
    if min_citations is not None:
        query = query.filter(Paper.cited_by_count >= min_citations)

    total = query.count()

    if sort == "cited":
        col = Paper.cited_by_count
    elif sort == "title":
        col = func.lower(Paper.title)
    else:
        col = Paper.publication_date
    order_by = col.asc() if order == "asc" else col.desc()
    query = query.order_by(order_by, Paper.id)

    page = max(1, page)
    page_size = max(1, min(100, page_size))
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    years = [
        y
        for (y,) in db.query(Paper.publication_year)
        .filter(Paper.project_id == project_id, Paper.publication_year.isnot(None))
        .distinct()
        .order_by(Paper.publication_year.desc())
        .all()
    ]
    topics = [
        t
        for (t,) in db.query(Topic.name)
        .join(PaperTopic, PaperTopic.topic_id == Topic.id)
        .filter(Topic.project_id == project_id)
        .distinct()
        .order_by(Topic.name)
        .all()
    ]
    return {
        "items": [paper_dict(db, p) for p in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "facets": {"years": years, "topics": topics},
    }


@router.get("/api/projects/{project_id}/papers/{paper_id}")
def get_paper(project_id: int, paper_id: int, db: Session = Depends(get_db)):
    p = db.query(Paper).filter(Paper.id == paper_id, Paper.project_id == project_id).first()
    if p is None:
        raise HTTPException(404, "Paper not found.")
    result = paper_dict(db, p)
    result["related"] = _related(db, p)
    return result


def _related(db: Session, paper: Paper, limit: int = 8) -> list[dict]:
    topic_ids = [
        tid for (tid,) in db.query(PaperTopic.topic_id).filter(PaperTopic.paper_id == paper.id).all()
    ]
    if not topic_ids:
        return []
    rows = (
        db.query(Paper, func.count(PaperTopic.topic_id).label("shared"))
        .join(PaperTopic, PaperTopic.paper_id == Paper.id)
        .filter(
            Paper.id != paper.id,
            Paper.project_id == paper.project_id,
            PaperTopic.topic_id.in_(topic_ids),
        )
        .group_by(Paper.id)
        .order_by(func.count(PaperTopic.topic_id).desc(), Paper.cited_by_count.desc())
        .limit(limit)
        .all()
    )
    return [paper_dict(db, p) for p, _ in rows]


@router.get("/api/projects/{project_id}/authors")
def list_authors(
    project_id: int,
    q: str | None = None,
    sort: str = "papers",
    order: str = "desc",
    limit: int = 30,
    db: Session = Depends(get_db),
):
    if db.get(Project, project_id) is None:
        raise HTTPException(404, "Project not found.")
    rows = (
        db.query(
            Author,
            func.count(Paper.id).label("pc"),
            func.coalesce(func.sum(Paper.cited_by_count), 0).label("tc"),
        )
        .join(PaperAuthor, PaperAuthor.author_id == Author.id)
        .join(Paper, Paper.id == PaperAuthor.paper_id)
        .filter(Paper.project_id == project_id)
        .group_by(Author.id)
    )
    if q:
        rows = rows.filter(Author.name.ilike(f"%{q}%"))
    result = [
        {
            "id": a.id,
            "name": a.name,
            "institution": a.institution,
            "country": a.country,
            "paper_count": pc,
            "total_citations": int(tc),
        }
        for a, pc, tc in rows.all()
    ]
    key = "paper_count" if sort == "papers" else "total_citations"
    result.sort(key=lambda x: x[key], reverse=(order != "asc"))
    return result[: max(1, min(200, limit))]


@router.get("/api/projects/{project_id}/authors/{author_id}")
def get_author(project_id: int, author_id: int, db: Session = Depends(get_db)):
    a = db.get(Author, author_id)
    if a is None:
        raise HTTPException(404, "Author not found.")
    papers = (
        db.query(Paper)
        .join(PaperAuthor, PaperAuthor.paper_id == Paper.id)
        .filter(PaperAuthor.author_id == author_id, Paper.project_id == project_id)
        .order_by(Paper.cited_by_count.desc())
        .all()
    )
    return {
        "id": a.id,
        "name": a.name,
        "institution": a.institution,
        "country": a.country,
        "paper_count": len(papers),
        "total_citations": sum(p.cited_by_count for p in papers),
        "papers": [paper_dict(db, p) for p in papers],
    }

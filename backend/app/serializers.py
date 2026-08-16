"""Serialization helpers: turn ORM objects into the JSON shapes defined in docs/API.md."""
from sqlalchemy.orm import Session

from .models import Author, Paper, PaperAuthor, PaperTopic, Project, Topic


def project_dict(p: Project) -> dict:
    return {
        "id": p.id,
        "slug": p.slug,
        "name": p.name,
        "description": p.description,
        "query": p.query,
        "status": p.status,
        "error": p.error,
        "paper_count": p.paper_count,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def paper_authors(db: Session, paper_id: int) -> list[dict]:
    rows = (
        db.query(Author, PaperAuthor.position)
        .join(PaperAuthor, PaperAuthor.author_id == Author.id)
        .filter(PaperAuthor.paper_id == paper_id)
        .order_by(PaperAuthor.position)
        .all()
    )
    return [
        {"id": a.id, "name": a.name, "institution": a.institution, "country": a.country}
        for a, _ in rows
    ]


def paper_topics(db: Session, paper_id: int) -> list[dict]:
    rows = (
        db.query(Topic, PaperTopic.score)
        .join(PaperTopic, PaperTopic.topic_id == Topic.id)
        .filter(PaperTopic.paper_id == paper_id)
        .order_by(PaperTopic.score.desc())
        .all()
    )
    return [
        {"id": t.id, "name": t.name, "kind": t.kind, "score": round(s, 4)}
        for t, s in rows
    ]


def paper_dict(db: Session, p: Paper, include_abstract: bool = True) -> dict:
    return {
        "id": p.id,
        "openalex_id": p.openalex_id,
        "title": p.title,
        "abstract": p.abstract if include_abstract else None,
        "ai_summary": p.ai_summary,
        "publication_date": p.publication_date.isoformat() if p.publication_date else None,
        "publication_year": p.publication_year,
        "cited_by_count": p.cited_by_count,
        "doi": p.doi,
        "url": p.url,
        "pdf_url": p.pdf_url,
        "arxiv_id": p.arxiv_id,
        "type": p.type,
        "kind": p.kind,
        "authors": paper_authors(db, p.id),
        "topics": paper_topics(db, p.id),
    }


def topic_trend(db: Session, project_id: int, topic_id: int) -> list[dict]:
    rows = (
        db.query(Paper.publication_year)
        .join(PaperTopic, PaperTopic.paper_id == Paper.id)
        .filter(PaperTopic.topic_id == topic_id, Paper.project_id == project_id)
        .all()
    )
    counts: dict[int, int] = {}
    for (year,) in rows:
        if year is not None:
            counts[year] = counts.get(year, 0) + 1
    return [{"year": y, "count": counts[y]} for y in sorted(counts)]

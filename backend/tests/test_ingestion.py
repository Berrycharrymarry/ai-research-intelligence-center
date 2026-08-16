from app import models
from app.services.ingestion import ingest_works
from helpers import make_project

WORKS = [
    {
        "openalex_id": "W1",
        "title": "Test Paper One",
        "abstract": "A test abstract about agents.",
        "publication_date": "2021-01-01",
        "publication_year": 2021,
        "cited_by_count": 5,
        "doi": None,
        "url": None,
        "pdf_url": None,
        "arxiv_id": None,
        "type": "article",
        "authors": [
            {"openalex_author_id": "A1", "name": "Alice", "institution": "X Lab", "country": None}
        ],
        "concepts": [{"name": "Reinforcement learning", "score": 0.7}],
        "referenced_works": ["W2"],
    },
    {
        "openalex_id": "W2",
        "title": "Test Paper Two",
        "abstract": "Another test abstract about planning.",
        "publication_date": "2022-02-02",
        "publication_year": 2022,
        "cited_by_count": 9,
        "doi": "10.1234/x",
        "url": "https://example.org/x",
        "pdf_url": None,
        "arxiv_id": None,
        "type": "preprint",
        "authors": [
            {"openalex_author_id": "A2", "name": "Bob", "institution": "Y Lab", "country": "US"}
        ],
        "concepts": [],
        "referenced_works": [],
    },
]


def test_ingest_idempotent(db):
    project = make_project(db)
    n1 = ingest_works(db, project.id, WORKS)
    n2 = ingest_works(db, project.id, WORKS)
    assert n1 == 2
    assert n2 == 0
    papers = db.query(models.Paper).filter(models.Paper.project_id == project.id).all()
    assert len(papers) == 2
    authors = db.query(models.Author).count()
    assert authors == 2
    links = db.query(models.PaperAuthor).count()
    assert links == 2


def test_ingest_creates_concept_topics(db):
    from app.services.topics import derive_topics

    project = make_project(db)
    ingest_works(db, project.id, WORKS)
    # concept data is stored on papers; topic derivation builds the concept topics
    p = db.query(models.Paper).filter(models.Paper.project_id == project.id).first()
    assert "Reinforcement learning" in (p.concepts_json or "")
    derive_topics(db, project.id)
    concepts = (
        db.query(models.Topic)
        .filter(models.Topic.project_id == project.id, models.Topic.kind == "concept")
        .all()
    )
    assert any(t.name == "Reinforcement learning" for t in concepts)

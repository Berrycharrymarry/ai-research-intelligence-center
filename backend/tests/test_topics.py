from app import models
from app.services.topics import derive_topics
from helpers import seed_corpus


def test_derive_topics_runs_and_attaches(client, db):
    project = seed_corpus(db)
    derive_topics(db, project.id)
    topics = (
        db.query(models.Topic).filter(models.Topic.project_id == project.id).all()
    )
    derived = [t for t in topics if t.kind == "derived"]
    assert len(derived) >= 3
    names = " ".join(t.name.lower() for t in topics)
    assert "tool use" in names  # corpus titles contain "Tool Use"
    links = db.query(models.PaperTopic).count()
    assert links >= 6


def test_topics_endpoint(client, db):
    project = seed_corpus(db)
    r = client.get(f"/api/projects/{project.id}/topics")
    assert r.status_code == 200
    summaries = r.json()
    assert len(summaries) >= 4
    t = next(s for s in summaries if s["name"] == "Tool Use")
    assert t["paper_count"] == 2
    assert t["total_citations"] == 83
    assert t["top_authors"] == ["Bob", "Alice"] or t["top_authors"][0] in ("Bob", "Alice")

from helpers import seed_corpus


def test_list_papers(client, db):
    seed_corpus(db)
    r = client.get("/api/projects/1/papers")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 6
    assert len(data["items"]) == 6
    assert "facets" in data
    item = data["items"][0]
    assert set(item) >= {"id", "title", "abstract", "ai_summary", "publication_year",
                         "cited_by_count", "authors", "topics"}


def test_search_papers(client, db):
    seed_corpus(db)
    r = client.get("/api/projects/1/papers", params={"q": "memory"})
    data = r.json()
    assert data["total"] >= 2
    assert all("memory" in p["title"].lower() or "memory" in (p["abstract"] or "").lower()
               for p in data["items"])


def test_sort_by_citations(client, db):
    seed_corpus(db)
    r = client.get("/api/projects/1/papers", params={"sort": "cited", "order": "desc"})
    items = r.json()["items"]
    assert items[0]["cited_by_count"] == 100


def test_filter_by_topic(client, db):
    seed_corpus(db)
    r = client.get("/api/projects/1/papers", params={"topic": "Tool Use"})
    items = r.json()["items"]
    assert len(items) == 2
    for p in items:
        assert "Tool Use" in [t["name"] for t in p["topics"]]


def test_filter_min_citations_and_pagination(client, db):
    seed_corpus(db)
    r = client.get("/api/projects/1/papers", params={"min_citations": 50, "page_size": 2})
    data = r.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["page_size"] == 2


def test_paper_detail_with_related(client, db):
    seed_corpus(db)
    r = client.get("/api/projects/1/papers/1")
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "Memory-Augmented Neural Agents"
    assert "related" in data
    # p2 and p3 cite W1 -> related by shared topic "Agent Memory" too


def test_authors_listing(client, db):
    seed_corpus(db)
    r = client.get("/api/projects/1/authors")
    assert r.status_code == 200
    authors = r.json()
    names = {a["name"] for a in authors}
    assert {"Alice", "Bob", "Carol"} <= names
    alice = next(a for a in authors if a["name"] == "Alice")
    assert alice["paper_count"] == 3

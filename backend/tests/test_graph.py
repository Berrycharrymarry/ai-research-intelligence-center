from app.services.graph import build_graph
from helpers import seed_corpus


def test_graph_nodes_and_edges(client, db):
    project = seed_corpus(db)
    data = build_graph(db, project.id)
    nodes = data["nodes"]
    edges = data["edges"]
    types = {n["data"]["type"] for n in nodes}
    assert {"paper", "author", "topic", "technology"} <= types

    rels = {e["data"]["relation"] for e in edges}
    assert "authored_by" in rels
    assert "belongs_to" in rels
    assert "cites" in rels  # real intra-corpus citation edges from references_json

    cite_edges = [e for e in edges if e["data"]["relation"] == "cites"]
    assert len(cite_edges) >= 4  # p2->p1, p3->p1, p3->p2, p5->p1


def test_graph_endpoint(client, db):
    project = seed_corpus(db)
    r = client.get(f"/api/projects/{project.id}/graph")
    assert r.status_code == 200
    payload = r.json()
    assert "nodes" in payload and "edges" in payload

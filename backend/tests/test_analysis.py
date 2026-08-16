from app.services.analysis import run_analysis, timeline_payload
from helpers import seed_corpus


def test_run_analysis(client, db):
    project = seed_corpus(db)
    result = run_analysis(db, project.id)
    assert result["model"] == "heuristic-v1"
    assert result["overview"]["stats"]["papers"] == 6
    assert result["trends"]["series"]
    phases = result["roadmap"]["phases"]
    assert len(phases) >= 1


def test_analysis_endpoint(client, db):
    project = seed_corpus(db)
    run_analysis(db, project.id)
    r = client.get(f"/api/projects/{project.id}/analysis")
    assert r.status_code == 200
    data = r.json()
    assert data["overview"] is not None
    assert data["trends"] is not None
    assert data["roadmap"] is not None
    assert data["landscape"] is not None
    assert data["model"] == "heuristic-v1"


def test_timeline(client, db):
    project = seed_corpus(db)
    payload = timeline_payload(db, project.id)
    assert payload["years"] == [2020, 2021, 2022, 2023, 2024]
    assert payload["series"][0] == {"year": 2020, "count": 1}
    assert payload["milestones"][-1]["year"] == 2024

from app.services.gaps import run_gaps
from helpers import seed_corpus


def test_run_gaps(client, db):
    project = seed_corpus(db)
    gaps = run_gaps(db, project.id)
    assert len(gaps) >= 1
    signals = {g["signal"] for g in gaps}
    assert "future_work" in signals  # corpus contains "future work"/"limitation" abstracts

    fw = next(g for g in gaps if g["signal"] == "future_work")
    assert fw["problem"]
    assert fw["why_worth"]
    assert isinstance(fw["existing_methods"], list)
    assert isinstance(fw["proposed_ideas"], list)
    assert fw["evidence_papers"]


def test_gaps_endpoint(client, db):
    project = seed_corpus(db)
    run_gaps(db, project.id)
    r = client.get(f"/api/projects/{project.id}/gaps")
    assert r.status_code == 200
    gaps = r.json()
    assert len(gaps) >= 1
    gid = gaps[0]["id"]
    r2 = client.get(f"/api/projects/{project.id}/gaps/{gid}")
    assert r2.status_code == 200
    assert r2.json()["id"] == gid

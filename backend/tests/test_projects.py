from app import models


def test_create_project(client):
    r = client.post(
        "/api/projects",
        json={"name": "My Topic", "description": "d", "query": "my topic search"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["slug"] == "my-topic"
    assert data["status"] == "created"


def test_duplicate_slug_409(client):
    client.post("/api/projects", json={"name": "Dup Name"})
    r = client.post("/api/projects", json={"name": "Dup-Name!"})
    assert r.status_code == 409


def test_get_and_delete_project(client, db):
    p = models.Project(slug="x", name="X", query="x")
    db.add(p)
    db.commit()
    db.refresh(p)

    r = client.get(f"/api/projects/{p.id}")
    assert r.status_code == 200
    assert r.json()["name"] == "X"

    r = client.delete(f"/api/projects/{p.id}")
    assert r.status_code == 204
    assert client.get(f"/api/projects/{p.id}").status_code == 404


def test_unknown_project_404(client):
    assert client.get("/api/projects/9999").status_code == 404


def test_collect_conflict_409(client, db):
    p = models.Project(slug="c", name="C", query="c", status="collecting")
    db.add(p)
    db.commit()
    db.refresh(p)
    assert client.post(f"/api/projects/{p.id}/collect").status_code == 409


def test_collect_202_schedules_task(client, db, monkeypatch):
    from app.routers import projects as projects_router

    monkeypatch.setattr(projects_router, "run_collect", lambda pid: None)
    p = models.Project(slug="c2", name="C2", query="c2", status="created")
    db.add(p)
    db.commit()
    db.refresh(p)
    r = client.post(f"/api/projects/{p.id}/collect")
    assert r.status_code == 202
    assert r.json() == {"status": "collecting"}

def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["db"] == "ok"


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200

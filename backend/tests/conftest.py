"""Pytest fixtures. Tests run against an in-memory SQLite DB (no network, no tempdir)."""
import os

# Point the global app engine at a harmless file so an accidental lifespan run
# never touches the real backend/data/research.db.
os.environ["RESEARCH_DB_PATH"] = os.path.join(os.path.dirname(__file__), "data", "test.db")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture(autouse=True)
def offline_tests(monkeypatch):
    """Never start demo collection or open a real HTTP connection during tests."""
    import httpx
    from collections import OrderedDict
    from app.services import progress

    monkeypatch.setattr("app.main.auto_seed", lambda: None)
    monkeypatch.setattr(progress, "_states", OrderedDict())

    def no_network(*args, **kwargs):
        raise AssertionError("Real HTTP requests are disabled in tests; use MockTransport.")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", no_network)


@pytest.fixture()
def engine():
    e = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(e)
    yield e
    e.dispose()


@pytest.fixture()
def db(engine):
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()


@pytest.fixture()
def client(engine):
    Session = sessionmaker(bind=engine)

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

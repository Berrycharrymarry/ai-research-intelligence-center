"""SQLAlchemy engine / session management."""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .config import settings
from .models import Base

engine = create_engine(
    f"sqlite:///{settings.research_db_path}",
    connect_args={"check_same_thread": False, "timeout": 30},
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    db_path = settings.research_db_path
    parent = os.path.dirname(os.path.abspath(db_path))
    os.makedirs(parent, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    # Lightweight migration for databases created before newer columns existed.
    with engine.begin() as conn:
        cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(papers)")]
        if "concepts_json" not in cols:
            conn.exec_driver_sql("ALTER TABLE papers ADD COLUMN concepts_json TEXT")
        if "kind" not in cols:
            conn.exec_driver_sql("ALTER TABLE papers ADD COLUMN kind VARCHAR DEFAULT 'search'")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Ensure tables + migrations exist for every entrypoint (server, seed, scripts, tests).
init_db()

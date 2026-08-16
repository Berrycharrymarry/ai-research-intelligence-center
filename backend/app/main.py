"""FastAPI application entrypoint."""
import logging
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db
from .logging_config import setup_logging
from .routers import analysis, health, insights, papers, projects

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIST = os.path.join(os.path.dirname(BACKEND_DIR), "frontend", "dist")

logger = logging.getLogger(__name__)

setup_logging()

DEFAULT_PROJECT = {
    "slug": "llm-agents",
    "name": "LLM Agents",
    "query": "LLM agents",
    "description": (
        "Autonomous agents built on large language models — planning, memory, tool use, "
        "multi-agent collaboration, and long-context reasoning."
    ),
}
DEFAULT_EXTRA_QUERIES = ["large language model agents", "multi-agent LLM"]


def auto_seed() -> None:
    """Populate the default demo project in a background thread when the database is empty.

    Needed for serverless/ephemeral hosts (e.g. Render free tier) where the SQLite file
    does not survive redeploys: the app provisions itself without blocking startup.
    """
    from .database import SessionLocal
    from .models import Paper, Project

    def run() -> None:
        db = SessionLocal()
        try:
            if db.query(Project).count() > 0:
                return
            project = Project(status="created", **DEFAULT_PROJECT)
            db.add(project)
            db.commit()
            db.refresh(project)
            logger.info("auto-seed: created default project id=%s", project.id)
            if db.query(Paper).filter(Paper.project_id == project.id).count() == 0:
                from .services.ingestion import collect

                logger.info("auto-seed: collecting real data for project %s ...", project.id)
                n = collect(project.id, extra_queries=DEFAULT_EXTRA_QUERIES)
                logger.info("auto-seed: collected %s papers", n)
        except Exception:  # never take the server down because of seeding
            logger.exception("auto-seed failed")
        finally:
            db.close()

    threading.Thread(target=run, daemon=True, name="auto-seed").start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    auto_seed()
    yield


app = FastAPI(
    title="AI Research Intelligence Center",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(projects.router)
app.include_router(papers.router)
app.include_router(insights.router)
app.include_router(analysis.router)


@app.get("/", include_in_schema=False)
def root():
    index = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return {
        "name": "AI Research Intelligence Center",
        "docs": "/docs",
        "health": "/api/health",
    }


# Serve the built frontend (single-origin deployment: no separate dev server needed).
if os.path.isdir(FRONTEND_DIST):
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

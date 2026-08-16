"""Seed the default "LLM Agents" demo project with real OpenAlex data.

Usage:
    python seed.py              # create default project (idempotent) + collect if empty
    python seed.py --refresh    # force re-collection
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
for p in (os.path.join(HERE, "vendor"), os.path.join(HERE, "pyenv")):
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)

from app.database import SessionLocal, init_db  # noqa: E402
from app.logging_config import setup_logging  # noqa: E402
from app.models import Paper, Project  # noqa: E402
from app.services.ingestion import collect, reanalyze  # noqa: E402

DEFAULT_PROJECT = {
    "slug": "llm-agents",
    "name": "LLM Agents",
    "query": "LLM agents",
    "description": (
        "Autonomous agents built on large language models — planning, memory, tool use, "
        "multi-agent collaboration, and long-context reasoning."
    ),
}

EXTRA_QUERIES = ["large language model agents", "multi-agent LLM"]


def main(refresh: bool = False, analyze: bool = False, local: bool = False) -> int:
    setup_logging()
    init_db()
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.slug == DEFAULT_PROJECT["slug"]).first()
        if project is None:
            project = Project(status="created", **DEFAULT_PROJECT)
            db.add(project)
            db.commit()
            db.refresh(project)
            print(f"[seed] created default project id={project.id} slug={project.slug}")

        paper_count = db.query(Paper).filter(Paper.project_id == project.id).count()
        if analyze:
            print(f"[seed] re-analyzing project {project.id} ({project.name}) ...")
            reanalyze(project.id, with_network=not local)
            print("[seed] re-analysis done")
        elif paper_count == 0 or refresh:
            print(f"[seed] collecting real data for project {project.id} ({project.name}) ...")
            n = collect(project.id, extra_queries=EXTRA_QUERIES)
            print(f"[seed] done: {n} papers collected")
        else:
            print(
                f"[seed] project already has {paper_count} papers; "
                "skipping collection (use --refresh to force, --analyze to re-run analysis)."
            )
        return project.id
    finally:
        db.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="force re-collection")
    parser.add_argument("--analyze", action="store_true", help="re-run enrichment + analysis only")
    parser.add_argument("--local", action="store_true", help="with --analyze: skip network stages")
    args = parser.parse_args()
    main(refresh=args.refresh, analyze=args.analyze, local=args.local)

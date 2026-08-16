"""Deterministic seed corpus for service/API tests."""
import json
from datetime import date

from app import models


def make_project(db, slug="test-project", name="Test Project", query="test"):
    p = models.Project(slug=slug, name=name, query=query, status="ready")
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def add_topic(db, project_id, name, kind="derived"):
    t = models.Topic(project_id=project_id, name=name, kind=kind)
    db.add(t)
    db.flush()
    return t


def link(db, paper, topic, score=0.9):
    db.add(models.PaperTopic(paper_id=paper.id, topic_id=topic.id, score=score))


def add_paper(db, project_id, oid, title, abstract, year, citations, refs=None, authors=None):
    p = models.Paper(
        project_id=project_id,
        openalex_id=oid,
        title=title,
        abstract=abstract,
        publication_year=year,
        publication_date=date(year, 1, 1),
        cited_by_count=citations,
        references_json=json.dumps(refs or []),
    )
    db.add(p)
    db.flush()
    for pos, name in enumerate(authors or []):
        a = db.query(models.Author).filter_by(name=name).first()
        if a is None:
            a = models.Author(name=name)
            db.add(a)
            db.flush()
        db.add(models.PaperAuthor(paper_id=p.id, author_id=a.id, position=pos))
    return p


def seed_corpus(db):
    """Six papers across 2020-2025 with topics, authors, real citation links, and
    future-work/limitation language for gap detection."""
    project = make_project(db)
    t_mem = add_topic(db, project.id, "Agent Memory", "derived")
    t_tool = add_topic(db, project.id, "Tool Use", "derived")
    t_plan = add_topic(db, project.id, "Planning", "derived")
    t_multi = add_topic(db, project.id, "Multi-Agent", "derived")
    t_rl = add_topic(db, project.id, "Reinforcement learning", "concept")

    p1 = add_paper(
        db, project.id, "W1", "Memory-Augmented Neural Agents",
        "Agents use memory for long tasks. Future work remains an open problem in consolidation.",
        2020, 100, authors=["Alice", "Bob"],
    )
    p2 = add_paper(
        db, project.id, "W2", "Tool Use for Language Agents",
        "Language agents call tools. A limitation is tool selection.", 2021, 80,
        refs=["W1"], authors=["Alice"],
    )
    p3 = add_paper(
        db, project.id, "W3", "Planning in Multi-Agent Systems",
        "Multi-agent planning is hard. We leave planning under uncertainty.", 2022, 60,
        refs=["W1", "W2"], authors=["Carol"],
    )
    p4 = add_paper(
        db, project.id, "W4", "Retrieval-Augmented Generation for Agents",
        "RAG improves agent knowledge.", 2023, 40, authors=["Bob"],
    )
    p5 = add_paper(
        db, project.id, "W5", "Long Context Agent Memory",
        "Long context memory for agents.", 2024, 5, refs=["W1"], authors=["Alice", "Carol"],
    )
    p6 = add_paper(
        db, project.id, "W6", "Emergent Tool Use in LLMs",
        "Tool use emerges in LLMs.", 2024, 3, authors=["Bob"],
    )

    link(db, p1, t_mem)
    link(db, p2, t_tool)
    link(db, p3, t_plan)
    link(db, p3, t_multi)
    link(db, p4, t_rl)
    link(db, p5, t_mem)
    link(db, p5, t_multi)
    link(db, p6, t_tool)
    db.commit()
    return project

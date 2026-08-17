"""SQLAlchemy ORM models (SQLite)."""
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    query = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="created")  # created|collecting|analyzing|ready|error
    error = Column(Text, nullable=True)
    paper_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class Paper(Base):
    __tablename__ = "papers"
    __table_args__ = (UniqueConstraint("project_id", "openalex_id", name="uq_paper_project_openalex"),)

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    openalex_id = Column(String, nullable=False, index=True)
    title = Column(Text, nullable=False)
    abstract = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)
    publication_date = Column(Date, nullable=True)
    publication_year = Column(Integer, nullable=True, index=True)
    cited_by_count = Column(Integer, nullable=False, default=0)
    doi = Column(String, nullable=True)
    url = Column(String, nullable=True)
    pdf_url = Column(String, nullable=True)
    arxiv_id = Column(String, nullable=True)
    type = Column(String, nullable=True)
    kind = Column(String, nullable=False, default="search")  # search | expand (cited backbone)
    references_json = Column(Text, nullable=True)  # JSON list of OpenAlex ids / CR:<doi>
    concepts_json = Column(Text, nullable=True)  # JSON list of {name, score}
    created_at = Column(DateTime, nullable=False, default=utcnow)


class Author(Base):
    __tablename__ = "authors"

    id = Column(Integer, primary_key=True)
    openalex_author_id = Column(String, nullable=True, index=True)
    name = Column(String, nullable=False, index=True)
    institution = Column(String, nullable=True)
    country = Column(String, nullable=True)


class PaperAuthor(Base):
    __tablename__ = "paper_authors"

    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True)
    author_id = Column(Integer, ForeignKey("authors.id", ondelete="CASCADE"), primary_key=True)
    position = Column(Integer, nullable=False, default=0)


class Topic(Base):
    __tablename__ = "topics"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_topic_project_name"),)

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="derived")  # concept|derived
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class PaperTopic(Base):
    __tablename__ = "paper_topics"

    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True)
    topic_id = Column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True)
    score = Column(Float, nullable=False, default=0.0)


class Source(Base):
    __tablename__ = "sources"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="search")
    query = Column(Text, nullable=True)
    fetched_at = Column(DateTime, nullable=False, default=utcnow)
    paper_count = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="ok")
    meta = Column(Text, nullable=True)


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String, nullable=False)  # overview|trends|roadmap|landscape
    title = Column(String, nullable=True)
    content = Column(Text, nullable=False)  # JSON
    model = Column(String, nullable=False, default="heuristic-v1")
    generated_at = Column(DateTime, nullable=False, default=utcnow)


class ResearchGap(Base):
    __tablename__ = "research_gaps"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    problem = Column(Text, nullable=True)
    why_worth = Column(Text, nullable=True)
    existing_methods = Column(Text, nullable=True)  # JSON list
    proposed_ideas = Column(Text, nullable=True)  # JSON list
    evidence_paper_ids = Column(Text, nullable=True)  # JSON list of paper ids
    confidence = Column(Float, nullable=False, default=0.5)
    signal = Column(String, nullable=True)
    # Chinese translations of the generated prose (None until re-analyzed)
    title_zh = Column(String, nullable=True)
    problem_zh = Column(Text, nullable=True)
    why_worth_zh = Column(Text, nullable=True)
    existing_methods_zh = Column(Text, nullable=True)  # JSON list
    proposed_ideas_zh = Column(Text, nullable=True)  # JSON list
    created_at = Column(DateTime, nullable=False, default=utcnow)

"""Collection pipeline: fetch from OpenAlex/Crossref, persist, derive topics/summaries/analyses/gaps."""
from __future__ import annotations

import json
import logging
import time
from collections import Counter
from datetime import date

from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models import Author, Paper, PaperAuthor, Project, Source
from . import crossref, openalex as oa
from .analysis import run_analysis
from .gaps import run_gaps
from .summary import summarize
from .topics import derive_topics

logger = logging.getLogger(__name__)

# Concept gate for citation expansion: keeps the expansion on-topic for computer-science
# research projects (drops e.g. economics/psychology classics cited by finance papers).
_EXPANSION_GATE = {"artificial intelligence", "computer science", "machine learning"}


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def ingest_works(db: Session, project_id: int, parsed_works: list[dict]) -> int:
    """Upsert papers/authors from parsed OpenAlex records. Returns new-paper count."""
    added = 0
    paper_by_openalex: dict[str, Paper] = {}
    _seen_links: set[tuple[int, int]] = set()
    for w in parsed_works:
        oid = w.get("openalex_id")
        if not oid:
            continue
        paper = (
            db.query(Paper)
            .filter(Paper.project_id == project_id, Paper.openalex_id == oid)
            .first()
        )
        if paper is None:
            paper = Paper(
                project_id=project_id,
                openalex_id=oid,
                kind=w.get("kind") or "search",
            )
            db.add(paper)
            added += 1
        paper.title = w.get("title") or "(untitled)"
        paper.abstract = w.get("abstract")
        paper.publication_date = _parse_date(w.get("publication_date"))
        paper.publication_year = w.get("publication_year")
        paper.cited_by_count = w.get("cited_by_count") or 0
        paper.doi = w.get("doi")
        paper.url = w.get("url")
        paper.pdf_url = w.get("pdf_url")
        paper.arxiv_id = w.get("arxiv_id")
        paper.type = w.get("type")
        paper.references_json = json.dumps(w.get("referenced_works") or [])
        paper.concepts_json = json.dumps(w.get("concepts") or [])
        db.flush()
        paper_by_openalex[oid] = paper

        for pos, a in enumerate(w.get("authors") or []):
            name = (a.get("name") or "").strip()
            if not name:
                continue
            author = None
            if a.get("openalex_author_id"):
                author = (
                    db.query(Author)
                    .filter(Author.openalex_author_id == a["openalex_author_id"])
                    .first()
                )
            if author is None:
                author = db.query(Author).filter(Author.name == name).first()
            if author is None:
                author = Author(openalex_author_id=a.get("openalex_author_id"), name=name)
                db.add(author)
                db.flush()
            if not author.institution and a.get("institution"):
                author.institution = a["institution"]
            if not author.country and a.get("country"):
                author.country = a["country"]
            # Guard against duplicate author entries within a single paper (autoflush is
            # off, so a DB query cannot see unflushed links — track them locally too).
            if (paper.id, author.id) not in _seen_links:
                _seen_links.add((paper.id, author.id))
                exists = (
                    db.query(PaperAuthor)
                    .filter_by(paper_id=paper.id, author_id=author.id)
                    .first()
                )
                if exists is None:
                    db.add(PaperAuthor(paper_id=paper.id, author_id=author.id, position=pos))

    db.commit()
    return added


def _enrich(db: Session, project_id: int, limit: int = 300) -> None:
    """Fill missing abstracts/citations via the OpenAlex single-record endpoint (per DOI).

    The single-record endpoint is subject to a different throttle than the search endpoint,
    so this often succeeds even while search is rate-limited.
    """
    papers = (
        db.query(Paper)
        .filter(Paper.project_id == project_id, Paper.abstract.is_(None))
        .order_by(Paper.cited_by_count.desc())
        .limit(limit)
        .all()
    )
    if not papers:
        return
    enriched = 0
    for p in papers:
        if not p.doi:
            continue
        try:
            w = oa.fetch_by_doi(p.doi)
        except Exception as e:
            logger.warning("OpenAlex enrichment stopped (%s)", e)
            break
        if w is None:
            continue
        if w.get("abstract"):
            p.abstract = w["abstract"]
            enriched += 1
        if (w.get("cited_by_count") or 0) > p.cited_by_count:
            p.cited_by_count = w["cited_by_count"]
        if not p.pdf_url and w.get("pdf_url"):
            p.pdf_url = w["pdf_url"]
        if not p.arxiv_id and w.get("arxiv_id"):
            p.arxiv_id = w["arxiv_id"]
        if w.get("concepts"):
            p.concepts_json = json.dumps(w.get("concepts") or [])
        time.sleep(0.35)
    db.commit()
    if enriched:
        db.add(
            Source(
                project_id=project_id,
                name="openalex",
                kind="enrich",
                query="DOI enrichment",
                paper_count=enriched,
                status="ok",
                meta=None,
            )
        )
        db.commit()
        logger.info("enriched %d papers with OpenAlex abstracts", enriched)


def expand_citations(db: Session, project_id: int, min_cited_by: int = 2, limit: int = 60) -> int:
    """Add foundational works that the corpus cites (by DOI, via OpenAlex single-record).

    This produces REAL `cites` edges inside the knowledge graph and populates the
    earlier (foundational) phase of the roadmap.
    """
    counter: Counter = Counter()
    for (refs_json,) in (
        db.query(Paper.references_json)
        .filter(Paper.project_id == project_id, Paper.references_json.isnot(None))
        .all()
    ):
        for r in json.loads(refs_json or "[]"):
            if not isinstance(r, str):
                continue
            if r.startswith("CR:"):
                counter[r[3:].lower()] += 1
            elif "openalex.org/W" in r:
                counter[r] += 1

    existing: set[str] = set()
    for oid, doi in (
        db.query(Paper.openalex_id, Paper.doi).filter(Paper.project_id == project_id).all()
    ):
        existing.add(oid)
        d = crossref.norm_doi(doi)
        if d:
            existing.add(f"CR:{d.lower()}")

    added = 0
    for key, n in counter.most_common():
        if n < min_cited_by or added >= limit:
            break
        if key in existing:
            continue
        try:
            if key.startswith("CR:"):
                w = oa.fetch_by_doi(key[3:])
            else:
                w = oa.fetch_by_id(key)
        except Exception as e:
            logger.warning("citation expansion stopped (%s)", e)
            break
        if w is None:
            continue
        # Domain gate: keep only works strongly tied to the AI/CS literature.
        # (OpenAlex diffuses weak CS/AI concept tags onto cross-domain classics that AI
        # papers cite, so presence alone is not enough — require a strong score.)
        gate_hit = False
        for c in w.get("concepts") or []:
            name = (c.get("name") or "").strip().lower()
            if name in _EXPANSION_GATE and (c.get("score") or 0.0) >= 0.45:
                gate_hit = True
                break
        if not gate_hit:
            continue
        w["openalex_id"] = key if key.startswith("CR:") else w["openalex_id"]
        w["kind"] = "expand"
        ingest_works(db, project_id, [w])
        added += 1
        time.sleep(0.35)

    db.add(
        Source(
            project_id=project_id,
            name="openalex",
            kind="expand",
            query="cited-work expansion",
            paper_count=added,
            status="ok" if added else "error",
            meta=None,
        )
    )
    db.commit()
    logger.info("citation expansion added %d foundational works", added)
    return added


def mark_backbone(db: Session, project_id: int, min_cited_by: int = 2) -> int:
    """Mark corpus papers cited by ≥2 corpus papers as kind='expand' (foundational works).

    Self-correcting: re-runs reconcile papers ingested before the kind marker existed.
    """
    counter: Counter = Counter()
    for (refs_json,) in (
        db.query(Paper.references_json)
        .filter(Paper.project_id == project_id, Paper.references_json.isnot(None))
        .all()
    ):
        for r in json.loads(refs_json or "[]"):
            if not isinstance(r, str):
                continue
            if r.startswith("CR:"):
                counter[r] += 1
            elif "openalex.org/W" in r:
                counter[r] += 1
    keys = {k for k, n in counter.items() if n >= min_cited_by}
    changed = 0
    for p in db.query(Paper).filter(Paper.project_id == project_id).all():
        if p.openalex_id in keys and (p.kind or "search") != "expand":
            p.kind = "expand"
            changed += 1
    db.commit()
    return changed


def reanalyze(project_id: int, with_network: bool = True) -> None:
    """Re-run topic derivation + summaries + analysis + gaps.

    with_network=True additionally re-runs OpenAlex enrichment + citation expansion.
    """
    db = SessionLocal()
    project = db.get(Project, project_id)
    if project is None:
        db.close()
        raise ValueError(f"Project {project_id} not found")
    try:
        project.status = "analyzing"
        project.error = None
        db.commit()
        if with_network:
            _enrich(db, project_id)
            expand_citations(db, project_id)
        mark_backbone(db, project_id)
        derive_topics(db, project_id)
        for p in db.query(Paper).filter(Paper.project_id == project_id).all():
            p.ai_summary = summarize(p.title, p.abstract)
        db.commit()
        run_analysis(db, project_id)
        run_gaps(db, project_id)
        project.paper_count = db.query(Paper).filter(Paper.project_id == project_id).count()
        project.status = "ready"
        project.error = None
        db.commit()
        logger.info("project %d reanalyzed with %d papers", project_id, project.paper_count)
    except Exception as e:
        logger.exception("reanalysis failed for project %s", project_id)
        try:
            db.rollback()
            project = db.get(Project, project_id)
            if project is not None:
                project.status = "error"
                project.error = str(e)
                db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()


def collect(project_id: int, extra_queries: list[str] | None = None) -> int:
    """Fetch real data from OpenAlex and run the full derivation pipeline."""
    db = SessionLocal()
    project = db.get(Project, project_id)
    if project is None:
        db.close()
        raise ValueError(f"Project {project_id} not found")

    try:
        project.status = "collecting"
        project.error = None
        db.commit()

        queries = [project.query] + [q for q in (extra_queries or []) if q]
        budget = settings.max_papers
        per_query = max(10, budget // max(1, len(queries)))

        # Ingest query-by-query so partial data persists even if upstream throttles us.
        total_fetched = 0
        openalex_down = False
        for q in queries:
            seen: set[str] = {
                oid
                for (oid,) in db.query(Paper.openalex_id).filter(Paper.project_id == project_id).all()
            }
            seen_titles: set[str] = {
                (t or "").strip().lower()
                for (t,) in db.query(Paper.title).filter(Paper.project_id == project_id).all()
            }

            parsed: list[dict] = []
            source_name = "openalex"
            raw: list = []
            if not openalex_down:
                try:
                    raw = oa.search_works(q, per_query)
                except Exception as e:
                    logger.error("OpenAlex search failed for %r: %s", q, e)
                    openalex_down = True
            for w in raw:
                if not w.get("id") or w["id"] in seen:
                    continue
                seen.add(w["id"])
                parsed.append(oa.parse_work(w))

            if len(parsed) < 5:
                logger.warning(
                    "OpenAlex yielded %d results for %r; using Crossref discovery",
                    len(parsed),
                    q,
                )
                source_name = "crossref"
                try:
                    cr = crossref.search_works(q, per_query)
                except Exception as e:
                    logger.error("Crossref search failed for %r: %s", q, e)
                    cr = []
                for c in cr:
                    if c["openalex_id"] in seen:
                        continue
                    if (c.get("title") or "").strip().lower() in seen_titles:
                        continue
                    seen.add(c["openalex_id"])
                    seen_titles.add((c.get("title") or "").strip().lower())
                    parsed.append(c)

            total_fetched += len(parsed)
            if parsed:
                ingest_works(db, project_id, parsed)
            db.add(
                Source(
                    project_id=project_id,
                    name=source_name,
                    kind="search",
                    query=q,
                    paper_count=len(parsed),
                    status="ok" if parsed else "error",
                    meta=json.dumps({"matched": len(raw) if source_name == "openalex" else None}),
                )
            )
            db.commit()
            logger.info(
                "query %r -> %d new works via %s (total fetched %d)",
                q,
                len(parsed),
                source_name,
                total_fetched,
            )
            if db.query(Paper).filter(Paper.project_id == project_id).count() >= budget:
                break

        # Best-effort OpenAlex enrichment for missing abstracts (single-record endpoint).
        _enrich(db, project_id)
        # Add foundational works the corpus cites (real cites edges + roadmap depth).
        expand_citations(db, project_id)
        mark_backbone(db, project_id)

        if total_fetched == 0 and db.query(Paper).filter(Paper.project_id == project_id).count() == 0:
            project.status = "error"
            project.error = "No results returned from OpenAlex or Crossref."
            db.commit()
            return 0

        project.status = "analyzing"
        db.commit()

        derive_topics(db, project_id)
        papers = db.query(Paper).filter(Paper.project_id == project_id).all()
        for p in papers:
            p.ai_summary = summarize(p.title, p.abstract)
        db.commit()

        run_analysis(db, project_id)
        run_gaps(db, project_id)

        project.paper_count = db.query(Paper).filter(Paper.project_id == project_id).count()
        project.status = "ready"
        project.error = None
        db.commit()
        logger.info("project %d ready with %d papers", project_id, project.paper_count)
        return project.paper_count

    except Exception as e:
        logger.exception("collection failed for project %s", project_id)
        try:
            db.rollback()
            project = db.get(Project, project_id)
            if project is not None:
                project.status = "error"
                project.error = str(e)
                db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()

"""Paged collection, batch enrichment and durable partial results."""
from __future__ import annotations

import json
import logging
from collections import Counter
from contextlib import nullcontext
from datetime import date

from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models import Author, Paper, PaperAuthor, Project, Source
from . import crossref, openalex as oa, progress
from .analysis import run_analysis
from .gaps import run_gaps
from .summary import summarize
from .topics import derive_topics

logger = logging.getLogger(__name__)
_EXPANSION_GATE = {"artificial intelligence", "computer science", "machine learning"}


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _key(value: str) -> str:
    if value.startswith("CR:"):
        return "CR:" + (crossref.norm_doi(value[3:]) or value[3:])
    return value.rstrip("/").split("/")[-1]


def _chunks(values, size=200):
    values = list(values)
    for offset in range(0, len(values), size):
        yield values[offset:offset + size]


def _merge_concepts(old: list, new: list) -> list:
    concepts = {c["name"]: c for c in old if c.get("name")}
    for concept in new:
        name = concept.get("name")
        if name and (name not in concepts or (concept.get("score") or 0) >
                     (concepts[name].get("score") or 0)):
            concepts[name] = concept
    return list(concepts.values())


def ingest_works(db: Session, project_id: int, parsed_works: list[dict]) -> int:
    """Batch upsert with DOI deduplication; only a few reads per batch, not per author.

    Keep a paper's database identity when Crossref discovers it before OpenAlex.
    Promote the canonical OpenAlex identifier; graph DOI matching stays available.
    """
    works = [w for w in parsed_works if w.get("openalex_id")]
    if not works:
        return 0
    existing = db.query(Paper).filter(Paper.project_id == project_id).all()
    by_id = {_key(p.openalex_id): p for p in existing}
    by_doi = {crossref.norm_doi(p.doi): p for p in existing if p.doi}
    author_rows = [a for w in works for a in w.get("authors") or [] if (a.get("name") or "").strip()]
    names = sorted({a["name"].strip() for a in author_rows})
    author_ids = sorted({a["openalex_author_id"] for a in author_rows if a.get("openalex_author_id")})
    authors: dict[int, Author] = {}
    for chunk in _chunks(names):
        authors.update((a.id, a) for a in db.query(Author).filter(Author.name.in_(chunk)).all())
    for chunk in _chunks(author_ids):
        authors.update((a.id, a) for a in db.query(Author).filter(Author.openalex_author_id.in_(chunk)).all())
    author_by_id = {a.openalex_author_id: a for a in authors.values() if a.openalex_author_id}
    author_by_name: dict[str, list[Author]] = {}
    for author in authors.values():
        author_by_name.setdefault(author.name, []).append(author)

    added = 0
    pending_links = []
    touched: dict[int, Paper] = {}
    with db.no_autoflush:
        for work in works:
            oid = work["openalex_id"]
            doi = crossref.norm_doi(work.get("doi"))
            if not doi and oid.startswith("CR:") and not oid.startswith("CR:t-"):
                doi = crossref.norm_doi(oid[3:])
            paper = by_id.get(_key(oid)) or (by_doi.get(doi) if doi else None)
            if paper is None:
                paper = Paper(project_id=project_id, openalex_id=oid, kind=work.get("kind") or "search")
                db.add(paper)
                added += 1
            elif paper.openalex_id.startswith("CR:") and not oid.startswith("CR:"):
                paper.openalex_id = oid
            by_id[_key(oid)] = paper
            if doi:
                by_doi[doi] = paper
            paper.title = work.get("title") or paper.title or "(untitled)"
            # Sparse fallback responses must not wipe richer metadata already saved.
            for field in ("abstract", "publication_year", "url", "pdf_url", "arxiv_id", "type"):
                if work.get(field) is not None:
                    setattr(paper, field, work[field])
            parsed_date = _parse_date(work.get("publication_date"))
            if parsed_date:
                paper.publication_date = parsed_date
            if doi:
                paper.doi = f"https://doi.org/{doi}"
            paper.cited_by_count = max(paper.cited_by_count or 0, work.get("cited_by_count") or 0)
            if work.get("kind") == "expand":
                paper.kind = "expand"
            refs = json.loads(paper.references_json or "[]") + (work.get("referenced_works") or [])
            paper.references_json = json.dumps(list(dict.fromkeys(r for r in refs if isinstance(r, str))))
            paper.concepts_json = json.dumps(_merge_concepts(json.loads(paper.concepts_json or "[]"),
                                                             work.get("concepts") or []))
            touched[id(paper)] = paper
            for position, data in enumerate(work.get("authors") or []):
                name = (data.get("name") or "").strip()
                if not name:
                    continue
                aid = data.get("openalex_author_id")
                author = author_by_id.get(aid) if aid else None
                if author is None:
                    # Distinct OpenAlex authors may share a name.
                    author = next((a for a in author_by_name.get(name, [])
                                   if not aid or not a.openalex_author_id), None)
                if author is None:
                    author = Author(openalex_author_id=aid, name=name)
                    db.add(author)
                    author_by_name.setdefault(name, []).append(author)
                elif aid and not author.openalex_author_id:
                    author.openalex_author_id = aid
                if aid:
                    author_by_id[aid] = author
                for field in ("institution", "country"):
                    if not getattr(author, field) and data.get(field):
                        setattr(author, field, data[field])
                pending_links.append((paper, author, position))
        # Resolve ID aliases discovered in this batch before persisting citations.
        for paper in list(existing) + list(touched.values()):
            refs = json.loads(paper.references_json or "[]")
            resolved = [by_id[_key(ref)].openalex_id if _key(ref) in by_id else ref for ref in refs]
            if resolved != refs:
                paper.references_json = json.dumps(list(dict.fromkeys(resolved)))
        db.flush()
        seen_links = set()
        for chunk in _chunks(p.id for p in touched.values()):
            seen_links.update(db.query(PaperAuthor.paper_id, PaperAuthor.author_id)
                              .filter(PaperAuthor.paper_id.in_(chunk)).all())
        for paper, author, position in pending_links:
            key = (paper.id, author.id)
            if key not in seen_links:
                seen_links.add(key)
                db.add(PaperAuthor(paper_id=paper.id, author_id=author.id, position=position))
        project = db.get(Project, project_id)
        if project:
            project.paper_count = len(existing) + added
    db.commit()
    if project and project.status in ("collecting", "analyzing"):
        progress.update(project_id, collected=project.paper_count, retry_after=None)
    return added


def _retry_progress(project_id: int, seconds: float) -> None:
    progress.update(project_id, retry_after=round(seconds, 1),
                    message="The source is busy; retrying. Saved papers remain available.",
                    warning="source_busy")


def _enrich(db: Session, project_id: int, limit: int = 300, client=None) -> bool:
    """Batch-fill missing abstracts, preserving canonical identifiers and citations."""
    papers = (db.query(Paper.doi).filter(Paper.project_id == project_id, Paper.abstract.is_(None),
                                   Paper.doi.isnot(None))
              .order_by(Paper.cited_by_count.desc()).limit(limit).all())
    enriched = 0
    complete = True
    with nullcontext(client) if client is not None else oa._client() as session:
        for chunk in _chunks([doi for doi, in papers], 100):
            try:
                works = oa.fetch_many(chunk, by="doi", client=session,
                                      on_retry=lambda seconds: _retry_progress(project_id, seconds))
            except Exception:
                logger.warning("OpenAlex batch enrichment unavailable for project %s", project_id)
                progress.update(project_id, warning="enrichment_unavailable", retry_after=None,
                                message="Some abstracts could not be updated. Saved papers remain available.")
                complete = False
                break
            lookup = {crossref.norm_doi(w.get("doi")): w for w in works if w.get("doi")}
            matched = [lookup[crossref.norm_doi(doi)] for doi in chunk if crossref.norm_doi(doi) in lookup]
            enriched += sum(bool(w.get("abstract")) for w in matched)
            ingest_works(db, project_id, matched)
    if papers:
        db.add(Source(project_id=project_id, name="openalex", kind="enrich", query="DOI enrichment",
                      paper_count=enriched, status="ok" if complete else "error"))
        db.commit()
    return complete


def _reference_counts(db: Session, project_id: int) -> Counter:
    counter = Counter()
    for (refs_json,) in db.query(Paper.references_json).filter(Paper.project_id == project_id).all():
        # Count citing papers, not duplicate reference entries within one paper.
        counter.update({_key(ref) for ref in json.loads(refs_json or "[]")
                        if isinstance(ref, str) and (ref.startswith("CR:") or _key(ref).startswith("W"))})
    return counter


def expand_citations(db: Session, project_id: int, min_cited_by: int = 2, limit: int = 60,
                     client=None) -> int:
    """Fetch cited foundational works in batches, with the original AI/CS gate."""
    counter = _reference_counts(db, project_id)
    existing = set()
    for oid, doi in db.query(Paper.openalex_id, Paper.doi).filter(Paper.project_id == project_id).all():
        existing.add(_key(oid))
        if crossref.norm_doi(doi):
            existing.add("CR:" + crossref.norm_doi(doi))
    candidates = [key for key, count in counter.most_common() if count >= min_cited_by and key not in existing]
    candidates = candidates[:max(100, limit * 5)] if limit > 0 else []
    added = 0
    failed = False
    with nullcontext(client) if client is not None else oa._client() as session:
        for chunk in _chunks(candidates, 100):
            if added >= limit:
                break
            try:
                resolved = []
                for by, values in (("doi", [k[3:] for k in chunk if k.startswith("CR:")]),
                                   ("openalex", [k for k in chunk if not k.startswith("CR:")])):
                    if values:
                        resolved.extend(oa.fetch_many(values, by=by, client=session,
                                                      on_retry=lambda seconds: _retry_progress(project_id, seconds)))
            except Exception:
                logger.warning("Citation batch unavailable for project %s", project_id)
                progress.update(project_id, warning="citations_unavailable", retry_after=None,
                                message="Citation expansion paused. Saved papers remain available.")
                failed = True
                break
            by_key = {}
            for work in resolved:
                by_key[_key(work["openalex_id"])] = work
                doi = crossref.norm_doi(work.get("doi"))
                if doi:
                    by_key["CR:" + doi] = work
            selected = []
            for key in chunk:
                work = by_key.get(key)
                if work is None:
                    continue
                identities = {_key(work["openalex_id"])}
                if work.get("doi"):
                    identities.add("CR:" + crossref.norm_doi(work["doi"]))
                if identities & existing:
                    continue
                if not any((c.get("name") or "").strip().lower() in _EXPANSION_GATE
                           and (c.get("score") or 0) >= 0.45 for c in work.get("concepts") or []):
                    continue
                existing.update(identities)
                selected.append({**work, "kind": "expand"})
                if added + len(selected) >= limit:
                    break
            added += ingest_works(db, project_id, selected)
    db.add(Source(project_id=project_id, name="openalex", kind="expand", query="cited-work expansion",
                  paper_count=added, status="error" if failed else "ok"))
    db.commit()
    return added


def mark_backbone(db: Session, project_id: int, min_cited_by: int = 2) -> int:
    keys = {key for key, count in _reference_counts(db, project_id).items() if count >= min_cited_by}
    changed = 0
    for paper in db.query(Paper).filter(Paper.project_id == project_id).all():
        identities = {_key(paper.openalex_id)}
        if paper.doi:
            identities.add("CR:" + crossref.norm_doi(paper.doi))
        if identities & keys and (paper.kind or "search") != "expand":
            paper.kind = "expand"
            changed += 1
    db.commit()
    return changed


def _analyze(db: Session, project: Project) -> None:
    project.status = "analyzing"
    db.commit()
    progress.update(project.id, stage="analyzing", retry_after=None,
                    message="Building topics, the knowledge graph and research insights")
    mark_backbone(db, project.id)
    derive_topics(db, project.id)
    for paper in db.query(Paper).filter(Paper.project_id == project.id).all():
        paper.ai_summary = summarize(paper.title, paper.abstract)
    db.commit()
    run_analysis(db, project.id)
    run_gaps(db, project.id)
    project.paper_count = db.query(Paper).filter(Paper.project_id == project.id).count()
    project.status = "ready"
    project.error = None
    db.commit()
    progress.update(project.id, stage="ready", collected=project.paper_count, retry_after=None,
                    message="Collection complete")


def _fail(db: Session, project_id: int, message: str) -> None:
    db.rollback()
    project = db.get(Project, project_id)
    if project:
        project.status = "error"
        project.error = message
        project.paper_count = db.query(Paper).filter(Paper.project_id == project_id).count()
        db.commit()
        progress.update(project_id, stage="error", collected=project.paper_count,
                        retry_after=None, message=message)


def reanalyze(project_id: int, with_network: bool = True) -> None:
    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        if project is None:
            raise ValueError(f"Project {project_id} not found")
        progress.begin(project_id, project.paper_count, settings.max_papers)
        project.status = "analyzing"
        project.error = None
        db.commit()
        if with_network:
            with oa._client() as client:
                progress.update(project_id, stage="enriching", message="Completing abstracts in batches")
                if _enrich(db, project_id, client=client):
                    progress.update(project_id, stage="expanding", message="Connecting foundational papers")
                    expand_citations(db, project_id, client=client)
        _analyze(db, project)
    except Exception:
        logger.exception("Reanalysis failed for project %s", project_id)
        _fail(db, project_id, "Analysis could not finish. Saved papers remain available; please retry.")
        raise
    finally:
        db.close()


def collect(project_id: int, extra_queries: list[str] | None = None) -> int:
    """Persist every discovery page before moving to optional metadata and analysis."""
    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        if project is None:
            raise ValueError(f"Project {project_id} not found")
        project.status = "collecting"
        project.error = None
        db.commit()
        progress.begin(project_id, project.paper_count, settings.max_papers)
        queries = list(dict.fromkeys([project.query] + [q for q in extra_queries or [] if q]))
        budget = max(1, settings.max_papers)
        per_query = max(10, budget // max(1, len(queries)))
        existing = db.query(Paper.openalex_id, Paper.doi, Paper.title).filter(Paper.project_id == project_id).all()
        seen = {_key(oid) for oid, _, _ in existing}
        seen_dois = {crossref.norm_doi(doi) for _, doi, _ in existing if doi}
        seen_titles = {(title or "").strip().lower() for _, _, title in existing}
        openalex_down = False

        def persist(works: list[dict], *, crossref_page=False) -> int:
            parsed = []
            for work in works:
                oid = work.get("openalex_id")
                if not oid:
                    continue
                doi = crossref.norm_doi(work.get("doi"))
                title = (work.get("title") or "").strip().lower()
                # OpenAlex metadata may upgrade an existing Crossref identity.
                if _key(oid) in seen or (crossref_page and (doi in seen_dois or title in seen_titles)):
                    continue
                seen.add(_key(oid))
                if doi:
                    seen_dois.add(doi)
                seen_titles.add(title)
                parsed.append(work)
            new_count = ingest_works(db, project_id, parsed)
            progress.update(project_id, retry_after=None, collected=project.paper_count,
                            message="Papers are ready to explore while collection continues")
            return new_count

        with oa._client() as oa_client, crossref._client() as cr_client:
            for query in queries:
                progress.update(project_id, stage="searching", retry_after=None,
                                message="Searching scholarly sources")
                matched = 0
                oa_added = 0
                search_error = False
                if not openalex_down:
                    try:
                        for raw in oa.iter_search_works(query, per_query, client=oa_client,
                                                       on_retry=lambda seconds: _retry_progress(project_id, seconds)):
                            matched += len(raw)
                            oa_added += persist([oa.parse_work(work) for work in raw])
                    except Exception:
                        logger.warning("OpenAlex search unavailable for project %s", project_id)
                        search_error = openalex_down = True
                        progress.update(project_id, warning="using_crossref", retry_after=None,
                                        message="Continuing with Crossref; saved papers remain available")
                db.add(Source(project_id=project_id, name="openalex", kind="search", query=query,
                              paper_count=oa_added, status="error" if search_error or openalex_down else "ok",
                              meta=json.dumps({"matched": matched})))
                db.commit()
                # Matches, not inserts: a repeat query is not an upstream outage.
                if search_error or openalex_down or matched < 5:
                    cr_added = 0
                    cr_error = False
                    remaining = max(0, per_query - matched)
                    try:
                        for page in crossref.iter_search_works(query, remaining, client=cr_client,
                                                              on_retry=lambda seconds: _retry_progress(project_id, seconds)):
                            cr_added += persist(page, crossref_page=True)
                    except Exception:
                        logger.warning("Crossref search unavailable for project %s", project_id)
                        cr_error = True
                        progress.update(project_id, warning="source_unavailable", retry_after=None,
                                        message="The source is unavailable. Previously saved papers are preserved.")
                    db.add(Source(project_id=project_id, name="crossref", kind="search", query=query,
                                  paper_count=cr_added, status="error" if cr_error else "ok"))
                    db.commit()
                if project.paper_count >= budget:
                    break
            if project.paper_count == 0:
                _fail(db, project_id, "No papers were returned by OpenAlex or Crossref. Please retry later.")
                return 0
            # Skip optional lookups when discovery has already exhausted provider retries.
            if not openalex_down:
                progress.update(project_id, stage="enriching", message="Completing abstracts in batches")
                if _enrich(db, project_id, client=oa_client):
                    progress.update(project_id, stage="expanding", message="Connecting foundational papers")
                    expand_citations(db, project_id, client=oa_client)
        _analyze(db, project)
        return project.paper_count
    except Exception:
        logger.exception("Collection failed for project %s", project_id)
        _fail(db, project_id, "Collection could not finish. Saved papers remain available; please retry.")
        raise
    finally:
        db.close()


def recover_interrupted_collections() -> None:
    """On this single-worker deployment, no pre-restart background jobs can survive."""
    with SessionLocal() as db:
        for project in db.query(Project).filter(Project.status.in_(("collecting", "analyzing"))).all():
            project.status = "error"
            project.error = "Collection was interrupted by a server restart. Saved papers remain available; please retry."
            project.paper_count = db.query(Paper).filter(Paper.project_id == project.id).count()
            progress.update(project.id, stage="error", collected=project.paper_count,
                            target=settings.max_papers, retry_after=None, warning="server_restarted",
                            message=project.error)
        db.commit()

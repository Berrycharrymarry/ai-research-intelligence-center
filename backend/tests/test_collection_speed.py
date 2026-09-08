import json
from copy import deepcopy

import pytest
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker

from app.models import Author, Paper, PaperAuthor, Project, Source
from app.serializers import project_dict
from app.services import ingestion, progress
from app.services.graph import build_graph
from helpers import make_project


def work(index, **extra):
    return {"openalex_id": f"https://openalex.org/W{index}", "title": f"Agent research {index}",
            "doi": f"https://doi.org/10.1234/{index}", "abstract": "Agents plan tasks using memory and tools.",
            "concepts": [{"name": "Artificial intelligence", "score": 0.8}], "referenced_works": [],
            "authors": [{"openalex_author_id": f"A{index}", "name": f"Researcher {index}"}], **extra}


def raw_work(index):
    return {"id": f"https://openalex.org/W{index}", "title": f"Agent research {index}",
            "doi": f"https://doi.org/10.1234/{index}", "abstract_inverted_index": {"Agent": [0], "planning": [1]},
            "publication_year": 2024, "concepts": [{"display_name": "Artificial intelligence", "score": 0.8}]}


@pytest.fixture()
def pipeline(engine, monkeypatch):
    factory = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(ingestion, "SessionLocal", factory)
    monkeypatch.setattr(ingestion.settings, "max_papers", 100)
    return factory


def test_ingest_batches_queries_and_updates_committed_count(db, engine):
    project = make_project(db)
    project_id = project.id
    reads = []

    def record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            reads.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        records = [work(i) for i in range(100)]
        assert ingestion.ingest_works(db, project_id, records) == 100
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert len(reads) <= 8  # previously ~400 reads for 100 papers with one author each
    assert db.get(Project, project_id).paper_count == 100
    assert db.query(PaperAuthor).count() == 100
    assert ingestion.ingest_works(db, project_id, records + [records[0]]) == 0


def test_doi_identity_promotion_keeps_paper_id_metadata_and_real_citations(db):
    project = make_project(db)
    original = work(1, openalex_id="CR:10.1234/1", authors=[{"name": "Alice"}], referenced_works=["CR:10.1234/other"])
    ingestion.ingest_works(db, project.id, [original, work(2, referenced_works=["CR:10.1234/1"])])
    original_id = db.query(Paper).filter(Paper.openalex_id == "CR:10.1234/1").one().id
    upgraded = work(1, abstract=None, authors=[{"name": "Alice", "openalex_author_id": "A1"}] * 2,
                    referenced_works=["https://openalex.org/W3"])
    assert ingestion.ingest_works(db, project.id, [upgraded, deepcopy(upgraded)]) == 0
    paper = db.get(Paper, original_id)
    assert paper.openalex_id == "https://openalex.org/W1"
    assert paper.abstract == original["abstract"]
    assert len(json.loads(paper.references_json)) == 2
    assert db.query(Paper).count() == 2
    assert db.query(PaperAuthor).filter(PaperAuthor.paper_id == original_id).count() == 1
    assert any(edge["data"]["relation"] == "cites" for edge in build_graph(db, project.id)["edges"])


def test_same_named_authors_with_distinct_ids_remain_distinct(db):
    project = make_project(db)
    ingestion.ingest_works(db, project.id, [work(1, authors=[{"name": "Li Wang", "openalex_author_id": "A1"},
                                                          {"name": "Li Wang", "openalex_author_id": "A2"}])])
    assert db.query(Author).count() == 2
    assert db.query(PaperAuthor).count() == 2


def test_300_abstracts_are_enriched_in_three_batches(db, monkeypatch):
    project = make_project(db)
    ingestion.ingest_works(db, project.id, [work(i, abstract=None) for i in range(300)])
    batches = []

    def fetch(values, by, **kwargs):
        assert by == "doi"
        batches.append(values)
        return [work(int(value.rsplit("/", 1)[-1])) for value in values]

    monkeypatch.setattr(ingestion.oa, "fetch_many", fetch)
    assert ingestion._enrich(db, project.id)
    assert [len(batch) for batch in batches] == [100, 100, 100]
    assert db.query(Paper).filter(Paper.abstract.isnot(None)).count() == 300
    assert db.query(Source).filter(Source.kind == "enrich").one().paper_count == 300


def test_batch_enrichment_partial_failure_preserves_first_batch(db, monkeypatch):
    project = make_project(db)
    ingestion.ingest_works(db, project.id, [work(i, abstract=None) for i in range(110)])
    calls = []

    def fetch(values, **kwargs):
        calls.append(values)
        if len(calls) == 2:
            raise RuntimeError("upstream unavailable")
        return [work(int(value.rsplit("/", 1)[-1])) for value in values]

    monkeypatch.setattr(ingestion.oa, "fetch_many", fetch)
    assert ingestion._enrich(db, project.id) is False
    assert db.query(Paper).filter(Paper.abstract.isnot(None)).count() == 100
    assert progress.snapshot(project.id, "collecting", 110)["warning"] == "enrichment_unavailable"


def test_citation_batches_resolve_crossref_dois_and_enforce_domain_gate(db, monkeypatch):
    project = make_project(db)
    refs = ["CR:10.1234/1", "https://openalex.org/W2", "https://openalex.org/W3"]
    ingestion.ingest_works(db, project.id, [work(10, referenced_works=refs), work(11, referenced_works=refs)])
    calls = []

    def fetch(values, by, **kwargs):
        calls.append((values, by))
        return [work(1)] if by == "doi" else [work(2), work(3, concepts=[{"name": "Economics", "score": 0.9}])]

    monkeypatch.setattr(ingestion.oa, "fetch_many", fetch)
    assert ingestion.expand_citations(db, project.id) == 2
    assert calls == [(["10.1234/1"], "doi"), (["W2", "W3"], "openalex")] or calls == [(["10.1234/1"], "doi"), (["W3", "W2"], "openalex")]
    assert db.query(Paper).filter(Paper.kind == "expand").count() == 2
    assert len([e for e in build_graph(db, project.id)["edges"] if e["data"]["relation"] == "cites"]) == 4
    assert ingestion.expand_citations(db, project.id) == 0


def test_citation_budget_is_applied_after_filtering_and_deduplicates_dois(db, monkeypatch):
    project = make_project(db)
    refs = [f"https://openalex.org/W{i}" for i in range(120)]
    ingestion.ingest_works(db, project.id, [work(200, referenced_works=refs), work(201, referenced_works=refs)])
    batches = []

    def fetch(values, **kwargs):
        batches.append(values)
        return [work(int(value[1:])) for value in values]

    monkeypatch.setattr(ingestion.oa, "fetch_many", fetch)
    assert ingestion.expand_citations(db, project.id, limit=60) == 60
    assert len(batches) == 1
    assert len(batches[0]) == 100
    assert db.get(Project, project.id).paper_count == 62


def test_collect_persists_first_page_before_second_page_and_reports_stages(db, pipeline, monkeypatch):
    project = make_project(db)
    pid = project.id
    observations = []

    def pages(*args, **kwargs):
        yield [raw_work(i) for i in range(5)]
        with pipeline() as check:
            current = check.get(Project, pid)
            observations.append(project_dict(current))
            assert current.paper_count == 5
            assert check.query(Paper).count() == 5
        yield [raw_work(i) for i in range(5, 10)]

    def enrich(*args, **kwargs):
        assert progress.snapshot(pid, "collecting", 10)["stage"] == "enriching"
        return True

    def expand(*args, **kwargs):
        assert progress.snapshot(pid, "collecting", 10)["stage"] == "expanding"
        return 0

    monkeypatch.setattr(ingestion.oa, "iter_search_works", pages)
    monkeypatch.setattr(ingestion, "_enrich", enrich)
    monkeypatch.setattr(ingestion, "expand_citations", expand)
    assert ingestion.collect(pid) == 10
    assert observations[0]["collection_progress"]["stage"] == "searching"
    db.expire_all()
    assert db.get(Project, pid).status == "ready"
    assert progress.snapshot(pid, "ready", 10)["stage"] == "ready"


def test_collect_rate_limit_and_fallback_failure_keep_partial_papers(db, pipeline, monkeypatch):
    project = make_project(db)
    pid = project.id

    def limited(*args, on_retry, **kwargs):
        yield [raw_work(i) for i in range(5)]
        on_retry(2)
        snapshot = progress.snapshot(pid, "collecting", 5)
        assert snapshot["retry_after"] == 2
        assert snapshot["warning"] == "source_busy"
        raise RuntimeError("https://upstream?api_key=secret")

    def fallback(*args, **kwargs):
        yield [work(30)]
        raise RuntimeError("fallback failed")

    monkeypatch.setattr(ingestion.oa, "iter_search_works", limited)
    monkeypatch.setattr(ingestion.crossref, "iter_search_works", fallback)
    monkeypatch.setattr(ingestion, "_enrich", lambda *a, **k: pytest.fail("must not retry unavailable provider"))
    assert ingestion.collect(pid) == 6
    db.expire_all()
    data = project_dict(db.get(Project, pid))
    assert data["status"] == "ready"
    assert data["paper_count"] == 6
    assert data["collection_progress"]["warning"] == "source_unavailable"
    assert "secret" not in json.dumps(data)


def test_collect_empty_sources_reaches_error_not_eternal_loading(db, pipeline, monkeypatch):
    project = make_project(db)
    pid = project.id
    monkeypatch.setattr(ingestion.oa, "iter_search_works", lambda *a, **k: iter([]))
    monkeypatch.setattr(ingestion.crossref, "iter_search_works", lambda *a, **k: iter([]))
    assert ingestion.collect(pid) == 0
    db.expire_all()
    current = db.get(Project, pid)
    assert current.status == "error"
    assert project_dict(current)["collection_progress"]["stage"] == "error"


def test_analysis_failure_does_not_erase_committed_papers(db, pipeline, monkeypatch):
    project = make_project(db)
    pid = project.id
    monkeypatch.setattr(ingestion.oa, "iter_search_works", lambda *a, **k: iter([[raw_work(i) for i in range(5)]]))
    monkeypatch.setattr(ingestion, "_enrich", lambda *a, **k: True)
    monkeypatch.setattr(ingestion, "expand_citations", lambda *a, **k: 0)

    def fail(*args):
        raise RuntimeError("private internal failure")

    monkeypatch.setattr(ingestion, "derive_topics", fail)
    with pytest.raises(RuntimeError):
        ingestion.collect(pid)
    db.expire_all()
    current = db.get(Project, pid)
    assert current.status == "error"
    assert current.paper_count == 5
    assert "private" not in json.dumps(project_dict(current))


def test_restart_recovers_interrupted_job_with_saved_count(db, pipeline):
    project = make_project(db)
    ingestion.ingest_works(db, project.id, [work(1)])
    project.status = "collecting"
    project.paper_count = 0
    db.commit()
    pid = project.id
    ingestion.recover_interrupted_collections()
    db.expire_all()
    current = db.get(Project, pid)
    assert current.status == "error"
    assert current.paper_count == 1
    assert project_dict(current)["collection_progress"]["warning"] == "server_restarted"

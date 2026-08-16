# AI Research Intelligence Center — Architecture

> Build spec for subagents. Read this together with `docs/API.md`. The API contract in
> `docs/API.md` is FROZEN — both backend and frontend must implement against it exactly.

## 1. Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.x (sync engine), SQLite, httpx (outbound HTTP), pydantic-settings.
- **Frontend**: React 18 + Vite, react-router-dom, Tailwind CSS v4, ECharts (charts), Cytoscape.js + cytoscape-fcose (knowledge graph), lucide-react (icons).
- **Database**: SQLite file at `backend/data/research.db` (configurable via `RESEARCH_DB_PATH`).

## 2. Repo layout

```
ai-research-intelligence-center/
  backend/
    requirements.txt
    run.py                  # entrypoint: uvicorn app.main:app
    .env.example
    app/
      main.py               # FastAPI app, CORS, routers, startup (ensure default project exists)
      config.py             # Settings (pydantic-settings)
      database.py           # engine, SessionLocal, Base, init_db()
      models.py             # SQLAlchemy ORM models
      schemas.py            # Pydantic response/request schemas
      logging_config.py     # stdlib logging setup (console + file backend/logs/app.log)
      routers/              # one file per resource (see API.md)
      services/
        openalex.py         # OpenAlex HTTP client (search + fetch, retries, polite backoff)
        ingestion.py        # collect pipeline (orchestrator)
        topics.py           # topic derivation (concepts + ngram clustering)
        summary.py          # extractive abstract summarization
        analysis.py         # trend / hotspot / roadmap / landscape analytics
        gaps.py             # research-gap heuristics
        graph.py            # build graph nodes/edges for cytoscape
      seed.py               # creates + populates default "LLM Agents" project (idempotent)
    tests/
      conftest.py           # temp-file SQLite fixture + seeded data fixtures
      test_*.py
    data/                   # gitignored: sqlite db lives here
    logs/                   # gitignored
  frontend/
    ... (Vite React app)
  docs/
    ARCHITECTURE.md
    API.md
  README.md
```

## 3. Data source decision (verified live)

- **Discovery (primary): OpenAlex works search** (`https://api.openalex.org/works?search=...`) —
  no API key; full-text relevance with citation counts, concepts, authors, references.
- **Discovery (fallback): Crossref works search** (`https://api.crossref.org/works?query=...`) —
  used automatically when OpenAlex search is throttled (429) so collection always succeeds.
- **Enrichment: OpenAlex single-record** (`/works/doi:{doi}`) — fills missing abstracts,
  concepts, citation counts, PDF/arXiv links; subject to a different throttle than search.
- **Citation expansion**: DOIs cited by ≥2 corpus papers are fetched via OpenAlex and added to
  the corpus (gated: the work must carry a strong AI/CS concept, score ≥ 0.45). This produces
  REAL `cites` edges and the roadmap's foundational phase.
- **arXiv** export API is UNREACHABLE from this environment (TLS failure) — not a dependency;
  arXiv ids come from OpenAlex records. **Semantic Scholar** was also rate-limited here and is
  not used.

Politeness: `mailto` param, ≥0.35s between requests, retries with capped exponential backoff
(Retry-After honored but capped at 20s), per-run circuit breaker on OpenAlex search failures.

## 4. Database schema (SQLAlchemy models in `app/models.py`)

All tables use an integer PK named `id`. Timestamps are timezone-aware UTC via `datetime.now(timezone.utc)`.

- `projects`: id, slug (unique), name, description, query, status
  (`created|collecting|analyzing|ready|error`), error (nullable), paper_count (int, default 0),
  created_at, updated_at.
- `papers`: id, project_id (FK), openalex_id, title, abstract (nullable), ai_summary (nullable),
  publication_date (DATE), publication_year (int), cited_by_count (int), doi (nullable), url (nullable),
  pdf_url (nullable), arxiv_id (nullable), type (nullable), references_json (TEXT, JSON list of
  OpenAlex ids or `CR:<doi>`), concepts_json (TEXT, JSON list of `{name, score}`), created_at.
  Unique constraint `(project_id, openalex_id)`.
- `authors`: id, openalex_author_id (nullable), name, institution (nullable), country (nullable).
- `paper_authors`: paper_id (FK), author_id (FK), position (int), primary key `(paper_id, author_id)`.
- `topics`: id, project_id (FK), name (unique per project), kind (`concept`|`derived`), description (nullable),
  created_at.
- `paper_topics`: paper_id (FK), topic_id (FK), score (float), primary key `(paper_id, topic_id)`.
- `sources`: id, project_id (FK), name (e.g. `openalex`), kind (`search`|`detail`), query (text),
  fetched_at, paper_count (int), status (`ok`|`error`), meta (TEXT json, e.g. total matched).
- `analyses`: id, project_id (FK), kind (`overview`|`trends`|`roadmap`|`landscape`|`gaps`), title,
  content (TEXT json), model (string, e.g. `heuristic-v1`), generated_at.
- `research_gaps`: id, project_id (FK), title, problem, why_worth, existing_methods (TEXT json list),
  proposed_ideas (TEXT json list), evidence_paper_ids (TEXT json list of paper ids), confidence (float),
  signal (string, the heuristic name), created_at.

`Paper.references_json` holds the `referenced_works` OpenAlex IDs so the graph can build REAL `cites` edges
between papers already in the corpus (match by `openalex_id`).

## 5. Ingestion pipeline (`services/ingestion.py`)

Triggered by `POST /api/projects/{id}/collect` (runs as a FastAPI BackgroundTask). Idempotent:
re-running upserts papers and recomputes derived data. Steps:

1. Set project.status = `collecting`.
2. For each query (project query + optional extras), per query: fetch from OpenAlex search; if it
   yields <5 results (or fails — circuit breaker trips after the first failure), fall back to
   Crossref search for the same query. Dedup by id and normalized title. Ingest immediately so
   partial data persists. Record a `sources` row per query (name = openalex|crossref).
3. **Enrichment** (`_enrich`): for papers missing abstracts (top-cited first), fetch the OpenAlex
   single record by DOI and backfill abstract, citations, concepts, PDF/arXiv links. Cap ~300.
4. **Citation expansion** (`expand_citations`): DOI references cited by ≥2 corpus papers are
   fetched (OpenAlex) and added as corpus works when they pass the AI/CS concept gate (score ≥ 0.45),
   up to 60 works. Stored under id `CR:<doi>` so corpus `cites` edges resolve.
5. Derive topics (`services/topics.py`) — replaces derived + concept topics each run.
6. Generate extractive `ai_summary` per paper (`services/summary.py`).
7. Run analytics (`services/analysis.py`) → write `analyses` rows (overview/trends/roadmap/landscape).
8. Run gap heuristics (`services/gaps.py`) → write `research_gaps` rows.
9. Update project.paper_count; status = `ready` (or `error` + message on exception).

`seed.py --analyze` re-runs steps 3–9 without new searches; `--analyze --local` skips the two
network stages (steps 3–4).

## 6. Topic derivation (`services/topics.py`)

Deterministic and domain-agnostic. Two complementary signals, both rebuilt on every run:

- **`concept` topics** (technology nodes): aggregated OpenAlex concepts (stored per-paper in
  `papers.concepts_json`; also harvested from existing links so local re-runs lose nothing).
  Ranked by summed score; single-paper concepts are dropped once the corpus ≥ 30 papers;
  over-generic concepts are blocklisted.
- **`derived` topics**: technical bigrams/trigrams from titles + abstracts, filtered by a
  hard-stopword list (function words never appear) + at most one generic academic token per
  phrase, scored by tf-idf, deduped by distinctive core token. These surface fine sub-directions
  (e.g. "Tool Use", "Multi-agent Systems", "Failure Modes").

Both topic kinds are deleted and recreated each run (idempotent), papers attached by keyword or
concept match with a `score` in [0,1].

## 7. Analytics (`services/analysis.py`)

All deterministic/statistical; every artifact records `model: "heuristic-v1"` so nothing is presented as
LLM-generated. Outputs (stored in `analyses` as JSON):

- **overview**: domain summary prose assembled from stats (paper count, date span, top topics, most-cited
  papers, top institutions) — template-based, values only from real data.
- **trends**: papers/year and per-topic papers/year series; compute year-over-year growth; identify
  `fastest_growing` and `declining` topics.
- **roadmap**: bucket papers into phases by year (foundational → growth → frontier) and list the dominant
  topics + representative papers per phase (the "technical route evolution").
- **landscape**: per-topic stats (paper count, total citations, mean year, top authors, top papers).

## 8. Research gaps (`services/gaps.py`)

Heuristic signals over real data; each gap stores `signal` and `confidence`. Signals:

1. `future_work` — abstracts matching phrases like "future work", "we leave", "limitation", "remains an
   open", "challenge"; extract the surrounding sentence as evidence and cite those papers.
2. `undercited_recent` — recent (last ~2 years) papers in a growing topic with citation count below the
   corpus median → "emerging, not yet validated".
3. `topic_intersection` — pairs of hot topics whose papers rarely co-occur → underexplored intersection.
4. `single_dominant` — a topic where one paper holds a very large share of citations → thin field.
5. `mature_decline` — topic with high legacy citations but declining recent output → efficiency/revisit gap.

Each gap record: `title`, `problem`, `why_worth`, `existing_methods` (from real top papers of the topic),
`proposed_ideas` (template suggestions grounded in the signal, clearly framed as suggestions),
`evidence_paper_ids` (real paper ids). No fabricated citations/statistics.

## 9. Knowledge graph (`services/graph.py`)

Computed on demand from the DB (not persisted). Node types and the cytoscape `data`:

- `paper` — id `paper:<id>`, label = short title, size ∝ citations, meta (year, citations).
- `author` — id `author:<id>`, label = name, meta (institution). Top-K authors by paper count (default 40).
- `topic` — id `topic:<id>`, label = name, meta (kind, paper count).
- `technology` — id `tech:<name>`, label = concept name, meta (paper count). Top OpenAlex concepts (default 25).

Edge types (and cytoscape `data.relation`):
- `authored_by` (paper → author, or author → paper; pick one direction and stay consistent: paper → author)
- `belongs_to` (paper → derived topic) and `uses` (paper → technology/concept)
- `cites` (paper → paper) from `references_json` matched against corpus ids AND normalized DOIs —
  REAL citation edges (backbone works included via citation expansion).
- `related_to` (paper → paper) via shared-topic cosine similarity ≥ 0.45, capped at 2 per paper.

Limit node/edge counts so the graph stays interactive (papers top ~120 by citations+recency, edges capped).

## 10. Frontend (see API.md + UI brief)

Routes:
- `/` → Dashboard
- `/explorer` → Paper Explorer
- `/timeline` → Research Timeline
- `/graph` → Knowledge Graph
- `/landscape` → Research Landscape
- `/analysis` → AI Research Analysis
- `/gaps` → Research Opportunities
- `/setup` → create/select Research Project (also reachable from sidebar)

A top-level `ProjectSwitcher` lets the user change active project (persisted in localStorage key
`research.projectId`). The API client prefixes `/api` and the Vite dev server proxies `/api` → backend
(`http://127.0.0.1:8000`).

## 11. Design language ("intelligence center")

- Dark, professional, dense, restrained. Background `#0a0d14`, panels `#11151f`/`#161c28`, hairline borders
  `#232b3a`, accent teal/cyan `#2dd4bf`/`#22d3ee`, warning amber `#f59e0b`, danger `#f87171`. Muted slate text.
  Tabular numerals via `font-variant-numeric: tabular-nums`; monospace (`JetBrains Mono` fallback `ui-monospace`)
  for data/labels. Inter for body.
- Subtle grid/graph-paper background (CSS), thin status indicators, uppercase micro-labels with letter-spacing.
- No neon gradients, no cartoon cards. Cards are flat panels with 1px borders and hover border-brighten.
- Designed for 1920×1080; responsive collapse of the sidebar on smaller widths.

## 12. Logging & errors

- Backend: stdlib `logging` with a `INFO` console handler and a `RotatingFileHandler` → `backend/logs/app.log`.
  Log ingestion progress (per-page fetched), API errors with status/url, and task lifecycle.
- API errors return a consistent JSON envelope: `{"detail": "<message>"}` (FastAPI default) with proper
  status codes (404 for unknown project/paper, 409 for duplicate project slug, 502 for upstream fetch failure).
- Frontend API client surfaces errors in a toast/status bar; empty states explain what to do.

## 13. Tests

`backend/tests` uses pytest with a temp-file SQLite DB (no network). Fixtures seed a small deterministic
corpus (papers/authors/topics/gaps/analyses) so analytics/graph/gap tests are deterministic. A separate
`test_openalex.py` marked `@pytest.mark.integration` hits the live API and is skipped when
`RUN_INTEGRATION=1` is not set. Cover: health, project CRUD, paper list/search/sort/filter, graph build,
topic derivation, analysis generation, gap generation, and ingestion idempotency against the seeded data.

## 14. Non-goals / honesty rules

- No LLM API keys are required; summaries/analyses are deterministic extractive/statistical and are labeled
  `heuristic-v1` in the DB and surfaced as such in the UI ("Statistical analysis", "Extractive summary").
- Do not fabricate papers, authors, citations, or statistics. All numbers come from OpenAlex records.

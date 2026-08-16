# AI Research Intelligence Center

**AI 科研情报作战室** — an interactive research intelligence platform. Enter a research
direction (e.g. *LLM Agents*, *Multimodal Agents*, *Generative Games*) and the system
collects, organizes, and analyzes real public research into an interactive intelligence
center: a dashboard, paper explorer, research timeline, interactive knowledge graph,
research landscape, statistical analysis, and a research-opportunities (gap) page.

Data is real — fetched from [OpenAlex](https://openalex.org) — and everything is persisted
to SQLite so page loads never re-hit upstream APIs.

---

## Features

- **Research Project** — create a named project with a custom search query; collect data with one click.
- **Automatic collection** — OpenAlex works search (title/abstract/full-text relevance), paginated, polite, retrying.
- **Paper Explorer** — server-side search, sort (date/citations/title), filter (topic, year range, min citations), pagination, and a detail view with abstract + extractive summary + links + related papers.
- **Research Timeline** — papers/year trend, per-topic growth series, and per-year milestones (interactive ECharts).
- **Knowledge Graph** — interactive Cytoscape force graph (drag / zoom / click). Node types: paper, author, topic, technology. Edge types: `authored_by`, `belongs_to`, `cites` (real intra-corpus citations), `related_to` (shared-topic similarity).
- **Research Landscape** — per-topic paper counts, citations, mean year, top authors, top papers, and trend sparklines.
- **AI Research Analysis** — deterministic domain overview, trends (fastest-growing / declining), and a technical-route roadmap (foundational → growth → frontier phases).
- **Research Opportunities** — heuristic gap mining from real signals: `future_work`, `undercited_recent`, `topic_intersection`, `single_dominant`, `mature_decline`.

## Honesty & limitations

- Summaries, topic clustering, trend analysis, and gap detection are **deterministic heuristics**
  (labeled `heuristic-v1` in the database and UI) — **not** LLM-generated. No API keys are required.
- Paper summaries are **extractive** (top sentences of the real abstract), never generated prose.
- No papers, authors, citations, or statistics are fabricated — everything originates from OpenAlex records.

## Architecture

| Layer | Tech |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2.x · SQLite · httpx |
| Frontend | React 18 · Vite · Tailwind CSS v4 · ECharts · Cytoscape.js + fcose · lucide-react |
| Data | OpenAlex REST API (no key) |
| Storage | SQLite (`backend/data/research.db`) |

```
backend/
  app/            # FastAPI app: routers, models, schemas, services
  services/       # openalex client, ingestion, topics, summary, analysis, gaps, graph
  seed.py         # creates + populates the default "LLM Agents" project (idempotent)
  run.py          # uvicorn entrypoint
  tests/          # pytest suite
frontend/
  src/pages/      # Dashboard, Explorer, Timeline, Graph, Landscape, Analysis, Gaps, Setup
  src/viz/        # Cytoscape graph + ECharts wrappers
docs/             # ARCHITECTURE.md + API.md (frozen contract)
```

### Database tables

`projects`, `papers`, `authors`, `paper_authors`, `topics`, `paper_topics`,
`sources`, `analyses`, `research_gaps` — see `docs/ARCHITECTURE.md` §4 for details.

## Data sources

The pipeline is resilient by design — every stage is recorded in the `sources` table:

1. **Discovery (primary): [OpenAlex](https://api.openalex.org) works search** — full-text relevance
   search (title, abstract, citations, concepts, authors, institutions, references).
2. **Discovery (fallback): [Crossref](https://api.crossref.org)** — if OpenAlex search is throttled
   (429) the collector automatically falls back to Crossref works search for the same query, so a
   research project can always be created. Results are deduplicated by id and title.
3. **Enrichment: OpenAlex single-record API (by DOI)** — fills missing abstracts, concepts,
   citation counts, PDF/arXiv links even while the search endpoint is rate-limited.
4. **Citation expansion** — foundational works cited by ≥2 corpus papers are fetched and added to
   the corpus, producing REAL `cites` edges in the knowledge graph and a meaningful "foundational"
   phase in the roadmap.

- **arXiv** export API is unreachable from this sandbox (TLS failure) — not a dependency; arXiv ids
  are taken from OpenAlex records when present.
- **Semantic Scholar** was evaluated but was also rate-limited from this network; Crossref + OpenAlex
  proved the most reliable key-free combination.

---

## Getting started

### Option A — standard environment

```bash
# backend
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
python run.py                 # serves http://127.0.0.1:8000

# frontend (new terminal)
cd frontend
npm install
npm run dev                   # serves http://127.0.0.1:5173  (proxies /api → :8000)
```

Open http://127.0.0.1:5173. The default **LLM Agents** project is created and populated on
first launch (`python seed.py` also runs it explicitly).

### Option B — this workspace (no global installs)

The environment blocks writes outside the workspace, so backend packages are vendored into
`backend/vendor` and a small compatibility shim lives in `backend/pyenv/`. Every `python`
invocation must run with:

```powershell
$root = 'C:\Users\Berry\dsh-workspace\ai-research-intelligence-center'
$env:PYTHONPATH = "$root\backend\pyenv;$root\backend\vendor;$root\backend"
$env:TEMP = "$root\.tmp"; $env:TMP = "$root\.tmp"
```

```powershell
# seed + run backend
python "$root\backend\seed.py"          # creates + populates the default project
python "$root\backend\run.py"           # http://127.0.0.1:8000

# frontend
$env:npm_config_cache = "$root\.npm-cache"
cd "$root\frontend"; npm install; npm run dev   # http://localhost:5173
```

`seed.py` flags: `--refresh` re-collects, `--analyze` re-runs enrichment + analysis only.

### Easiest way to run (double-click)

- `start-app.bat` — starts backend + frontend and opens the app (http://127.0.0.1:8000/).
- `stop-app.bat` — stops both servers.

The app runs as long as your computer stays on, independent of any chat session.

---

## Tests

```bash
cd backend
# standard env
python -m pytest tests -q

# sandboxed env (set PYTHONPATH/TEMP as above)
$env:PYTHONPATH = "$root\backend\pyenv;$root\backend\vendor"
python -m pytest "$root\backend\tests" -q
```

Tests cover: health, project CRUD, paper search/sort/filter, topic derivation, graph building
(including real `cites` edges), analysis generation, gap generation, and ingestion idempotency.

Additional verification scripts (run against a live backend):

```bash
python smoke.py            # 13-endpoint API smoke test (health → overview)
python e2e_project.py      # full flow: create project → collect real data → verify payloads
```

## API

Full contract: [`docs/API.md`](docs/API.md). Quick reference:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness |
| GET/POST | `/api/projects` | list / create |
| GET/DELETE | `/api/projects/{id}` | detail / delete |
| POST | `/api/projects/{id}/collect` | trigger collection (async) |
| GET | `/api/projects/{id}/papers` | search/sort/filter (paginated) |
| GET | `/api/projects/{id}/papers/{pid}` | paper detail + related |
| GET | `/api/projects/{id}/authors` | top authors |
| GET | `/api/projects/{id}/topics` | landscape |
| GET | `/api/projects/{id}/timeline` | timeline payload |
| GET | `/api/projects/{id}/graph` | graph nodes/edges |
| GET | `/api/projects/{id}/analysis` | analysis bundle |
| GET | `/api/projects/{id}/gaps` | research opportunities |
| GET | `/api/projects/{id}/overview` | dashboard aggregate |

## Logging

Backend logs to console and `backend/logs/app.log` (rotating). Ingestion progress, upstream
errors, and task lifecycle are logged.

## Roadmap / possible upgrades

- LLM-powered summaries & gap ranking (pluggable, currently heuristic-only).
- Semantic Scholar / Crossref enrichment for extra citation + venue metadata.
- Embedding-based topic clustering and a 2D landscape embedding.
- Scheduled re-collection and citation-trend alerts.
- Auth, multi-user workspaces, and export (CSV/BibTeX).

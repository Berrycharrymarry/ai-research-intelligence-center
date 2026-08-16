# API Contract (FROZEN)

Base URL: `http://127.0.0.1:8000`. All JSON. Prefix `/api`. The Vite dev server proxies `/api` here.

Errors use FastAPI's default `{"detail": "..."}` with correct status codes.

## Common conventions

- Dates are ISO `YYYY-MM-DD`. Datetimes ISO 8601 UTC with `Z` or `+00:00`.
- All list endpoints return either a bare JSON array or a paginated envelope
  `{"items": [...], "total": <int>, "page": <int>, "page_size": <int>}` (noted per endpoint).
- `paper` objects always include: `id`, `openalex_id`, `title`, `abstract`, `ai_summary`,
  `publication_date`, `publication_year`, `cited_by_count`, `doi`, `url`, `pdf_url`, `arxiv_id`, `type`,
  `authors` (list of `{id, name, institution}`), `topics` (list of `{id, name, kind, score}`).

---

## Health

### GET /api/health
→ `{"status": "ok", "version": "1.0.0", "db": "ok", "time": "<iso>"}`

---

## Projects

### GET /api/projects
→ array of `{id, slug, name, description, query, status, error, paper_count, created_at, updated_at}`

### POST /api/projects
Body: `{"name": "LLM Agents", "description": "optional", "query": "optional search query (defaults to name)"}`
→ 201 `{...project, status: "created"}`. If slug already exists → 409.

### GET /api/projects/{id}
→ full project object + `{"status", "paper_count", "top_topics": [<topic summary>], "latest_papers": [<paper>]}`

### POST /api/projects/{id}/collect
Kicks off collection + analysis as a background task. → 202 `{"status": "collecting"}`.
If already collecting → 409. 404 if unknown project.

### DELETE /api/projects/{id}
→ 204. Cascades papers/authors(association)/topics/analyses/gaps/sources.

---

## Papers

### GET /api/projects/{id}/papers
Query params (all optional):
- `q` — search across title + abstract
- `topic` — topic name (exact) filter
- `sort` — `date` | `cited` | `title` (default `date`)
- `order` — `desc` | `asc` (default `desc`)
- `year_from`, `year_to` — ints
- `min_citations` — int
- `page` (default 1), `page_size` (default 20, max 100)

→ `{"items": [<paper>...], "total", "page", "page_size", "facets": {"years": [<int>...], "topics": [<name>...]}}`

### GET /api/projects/{id}/papers/{paper_id}
→ full paper + `authors`, `topics`, `related` (list of up to 8 paper summaries sharing topics, excluding self).

---

## Authors

### GET /api/projects/{id}/authors
Query: `q`, `sort` (`papers` | `citations`), `order`, `limit` (default 30).
→ `[{"id", "name", "institution", "country", "paper_count", "total_citations"}]`

### GET /api/projects/{id}/authors/{author_id}
→ `{"id", "name", "institution", "country", "paper_count", "total_citations", "papers": [<paper>...]}`

---

## Topics / Landscape

### GET /api/projects/{id}/topics
→ array of topic summaries:
`{"id", "name", "kind", "description", "paper_count", "total_citations", "mean_year", "top_authors": [<name>...], "top_papers": [<paper>...], "trend": [{"year": int, "count": int}...]}`

### GET /api/projects/{id}/topics/{topic_id}
→ topic summary + `papers` (all papers in topic, sorted by citations).

---

## Timeline

### GET /api/projects/{id}/timeline
→ `{"years": [<int>...], "series": [{"year", "count"}...], "by_topic": [{"topic": "<name>", "series": [{"year", "count"}...]}...], "milestones": [{"year", "title", "citations", "paper_id"}...]}`

`milestones` = most-cited paper per year (the notable papers that anchor the timeline).

---

## Knowledge Graph

### GET /api/projects/{id}/graph
Query: `papers_limit` (default 120), `authors_limit` (default 40), `topics_limit` (default 15).
→ `{"nodes": [...], "edges": [...]}`

Node: `{"data": {"id": "paper:12", "label": "...", "type": "paper", "size": <int>, "year": <int>, "citations": <int>, "name": "..."}}`
`type` ∈ `paper|author|topic|technology`. `size` is a pre-computed node size hint.
Edge: `{"data": {"id": "e1", "source": "paper:12", "target": "topic:3", "relation": "belongs_to"}}`
`relation` ∈ `authored_by|cites|related_to|belongs_to`.

---

## Analysis

### GET /api/projects/{id}/analysis
→ latest analysis bundle:
`{"overview": {...}, "trends": {...}, "roadmap": {...}, "landscape": {...}, "model": "heuristic-v1", "generated_at": "<iso>"}`

Shapes:
- `overview`: `{"summary": "<prose>", "stats": {"papers", "years_span", "top_topics": [...], "top_papers": [<paper>...], "top_institutions": [...]}}`
- `trends`: `{"series": [{"year", "count"}...], "fastest_growing": [{"topic", "growth"}...], "declining": [{"topic", "growth"}...]}`
- `roadmap`: `{"phases": [{"phase": "foundational|growth|frontier", "years": [a,b], "description": "...", "topics": [...], "papers": [<paper>...]}...]}`
- `landscape`: same as `/topics` array (may be a copy).

### GET /api/projects/{id}/analysis/trends
→ just the `trends` object (for charts).

---

## Research Gaps

### GET /api/projects/{id}/gaps
→ array of:
`{"id", "title", "problem", "why_worth", "existing_methods": [<str>...], "proposed_ideas": [<str>...], "evidence_papers": [<paper>...], "confidence", "signal", "created_at"}`

### GET /api/projects/{id}/gaps/{gap_id}
→ single gap object (same shape).

---

## Dashboard

### GET /api/projects/{id}/overview
Single aggregate for the dashboard:
`{"project": <project>, "stats": {"papers", "authors", "topics", "gaps", "citations", "avg_citations", "year_span": [a,b]}, "activity": [{"year", "count"}...], "trending_topics": [{"name", "count", "growth"}...], "latest_papers": [<paper>...], "top_papers": [<paper>...], "timeline": <timeline payload>, "graph": <graph payload>, "gaps": [<gap>...]}`

---

## Notes for implementers

- The frontend should render a loading/empty state while `project.status` is `collecting`/`analyzing` and
  poll `GET /api/projects/{id}` every ~1.5s until `ready`/`error`.
- Sorting/filtering/search for papers MUST be implemented server-side (SQL) — not in the browser.
- All analysis/gap content MUST be produced by the backend and stored in DB; the frontend only displays it.

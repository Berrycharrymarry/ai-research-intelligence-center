"""OpenAlex client with pooled connections, bounded retries and 100-work batches."""
from __future__ import annotations

import logging
import re
import time
from contextlib import nullcontext
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from threading import Lock

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

USER_AGENT = "AI-Research-Intelligence-Center/1.0 (mailto:research-intel@example.com)"
WORK_FIELDS = ("id,doi,title,abstract_inverted_index,publication_date,publication_year,"
               "cited_by_count,primary_location,locations,ids,type,authorships,concepts,referenced_works")
_rate_lock = Lock()
_next_request = 0.0


class OpenAlexUnavailable(RuntimeError):
    """An upstream failure, without URLs or API credentials in the public message."""


def _auth_params() -> dict:
    params = {"mailto": settings.openalex_mailto}
    if settings.openalex_api_key:
        params["api_key"] = settings.openalex_api_key
    return params


def _throttle() -> None:
    global _next_request
    with _rate_lock:
        wait = max(0.0, _next_request - time.monotonic())
        if wait > 20:
            raise OpenAlexUnavailable("OpenAlex is cooling down. Saved papers remain available.")
        if wait:
            time.sleep(wait)
        _next_request = time.monotonic() + max(0.0, settings.request_interval)


def _cooldown(seconds: float) -> None:
    global _next_request
    with _rate_lock:
        _next_request = max(_next_request, time.monotonic() + seconds)


def _retry_seconds(value: str | None, default: float) -> float:
    if not value:
        return default
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            dt = parsedate_to_datetime(value)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return max(0.0, (dt - datetime.now(timezone.utc)).total_seconds())
        except (ValueError, TypeError, OverflowError):
            return default


def _client() -> httpx.Client:
    return httpx.Client(timeout=30.0, headers={"User-Agent": USER_AGENT})


def _get_with_retry(client: httpx.Client, url: str, params: dict, max_retries: int = 3,
                    on_retry=None) -> dict:
    delay = 1.0
    for attempt in range(max_retries):
        try:
            _throttle()
            r = client.get(url, params=params)
        except httpx.HTTPError:
            logger.warning("OpenAlex connection error (attempt %d/%d)", attempt + 1, max_retries)
            if attempt + 1 < max_retries:
                if on_retry:
                    on_retry(delay)
                _cooldown(delay)
            delay = min(delay * 2, 20.0)
            continue
        if r.status_code == 200:
            return r.json()
        if r.status_code in (429, 500, 502, 503, 504):
            wait = _retry_seconds(r.headers.get("Retry-After"), delay)
            logger.warning("OpenAlex HTTP %s; retry delay %.1fs", r.status_code, wait)
            if on_retry:
                on_retry(wait)
            # Respect a long provider cooldown without blocking a collection for hours.
            _cooldown(wait)
            if wait > 20:
                raise OpenAlexUnavailable("OpenAlex is temporarily rate limited. Saved papers remain available.")
            delay = min(delay * 2, 20.0)
            continue
        # e.g. 404: no point retrying — propagate immediately
        r.raise_for_status()
    raise OpenAlexUnavailable("OpenAlex could not respond after retries.")


def iter_search_works(query: str, max_results: int, per_page: int = 100,
                      client: httpx.Client | None = None, on_retry=None):
    """Yield each page immediately so callers can commit usable partial results."""
    fetched = 0
    cursor = "*"
    with nullcontext(client) if client is not None else _client() as session:
        while fetched < max_results:
            params = {
                "search": query,
                "per-page": min(100, max(1, per_page), max_results - fetched),
                "sort": "relevance_score:desc",
                "cursor": cursor,
                "select": WORK_FIELDS,
                **_auth_params(),
            }
            data = _get_with_retry(session, f"{settings.openalex_base_url}/works", params,
                                   on_retry=on_retry)
            results = data.get("results") or []
            if not results:
                break
            yield results
            fetched += len(results)
            next_cursor = (data.get("meta") or {}).get("next_cursor")
            if not next_cursor or next_cursor == cursor:
                break
            cursor = next_cursor


def search_works(query: str, max_results: int, per_page: int = 100) -> list[dict]:
    return [work for page in iter_search_works(query, max_results, per_page) for work in page]


def fetch_many(values: list[str], by: str = "openalex", client: httpx.Client | None = None,
               on_retry=None) -> list[dict]:
    """Resolve known OpenAlex IDs or DOIs using OR filters, at most 100 per request."""
    if by not in ("openalex", "doi"):
        raise ValueError("Batch lookups support OpenAlex IDs or DOIs.")
    normalized = []
    for value in values:
        if by == "doi":
            value = re.sub(r"^https?://(dx\.)?doi\.org/", "", value.strip(), flags=re.I)
            value = re.sub(r"^doi:\s*", "", value, flags=re.I).lower()
        else:
            value = value.rstrip("/").split("/")[-1]
        if value and value not in normalized:
            normalized.append(value)
    works = []
    with nullcontext(client) if client is not None else _client() as session:
        for offset in range(0, len(normalized), 100):
            chunk = normalized[offset:offset + 100]
            params = {"filter": f"{by}:" + "|".join(chunk), "per-page": 100,
                      "select": WORK_FIELDS, **_auth_params()}
            data = _get_with_retry(session, f"{settings.openalex_base_url}/works", params,
                                   on_retry=on_retry)
            works.extend(parse_work(work) for work in data.get("results") or [])
    return works


def fetch_by_id(work_id: str) -> dict | None:
    """Fetch a single work by OpenAlex id (e.g. W4387835442 or full URL)."""
    wid = work_id.rstrip("/").split("/")[-1]
    client = _client()
    try:
        try:
            data = _get_with_retry(
                client,
                f"{settings.openalex_base_url}/works/{wid}",
                _auth_params(),
                max_retries=2,
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise
        return parse_work(data)
    finally:
        client.close()


def fetch_by_doi(doi: str) -> dict | None:
    """Fetch a single work by DOI. Returns a parsed dict, or None when the DOI is unknown."""
    bare = re.sub(r"^https?://(dx\.)?doi\.org/", "", (doi or "").strip())
    client = _client()
    try:
        try:
            data = _get_with_retry(
                client,
                f"{settings.openalex_base_url}/works/doi:{bare}",
                _auth_params(),
                max_retries=2,
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise
        return parse_work(data)
    finally:
        client.close()


def reconstruct_abstract(inverted_index: dict | None) -> str | None:
    if not inverted_index:
        return None
    positions: dict[int, str] = {}
    for word, idxs in inverted_index.items():
        for i in idxs:
            positions[i] = word
    if not positions:
        return None
    return " ".join(positions[i] for i in sorted(positions))


def _extract_arxiv_id(work: dict) -> str | None:
    for loc in work.get("locations") or []:
        blob = f"{loc.get('landing_page_url') or ''} {loc.get('pdf_url') or ''}".lower()
        m = re.search(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5}(?:v\d+)?)", blob)
        if m:
            return m.group(1)
    ids = work.get("ids") or {}
    arxiv = ids.get("arxiv")
    if arxiv:
        return arxiv.split("/")[-1]
    return None


def parse_work(work: dict) -> dict:
    """Normalize an OpenAlex work record into the ingestion schema."""
    abstract = reconstruct_abstract(work.get("abstract_inverted_index"))
    loc = work.get("primary_location") or {}
    authors = []
    for a in work.get("authorships") or []:
        author = a.get("author") or {}
        insts = a.get("institutions") or []
        countries = a.get("countries") or []
        authors.append(
            {
                "openalex_author_id": author.get("id"),
                "name": (author.get("display_name") or "").strip(),
                "institution": insts[0].get("display_name") if insts else None,
                "country": countries[0] if countries else None,
            }
        )
    concepts = [
        {"name": c.get("display_name"), "score": c.get("score") or 0.0}
        for c in work.get("concepts") or []
        if c.get("display_name")
    ]
    return {
        "openalex_id": work.get("id"),
        "title": (work.get("title") or "").strip() or "(untitled)",
        "abstract": abstract,
        "publication_date": work.get("publication_date"),
        "publication_year": work.get("publication_year"),
        "cited_by_count": work.get("cited_by_count") or 0,
        "doi": work.get("doi"),
        "url": loc.get("landing_page_url") or work.get("doi"),
        "pdf_url": loc.get("pdf_url"),
        "arxiv_id": _extract_arxiv_id(work),
        "type": work.get("type"),
        "authors": authors,
        "concepts": concepts,
        "referenced_works": work.get("referenced_works") or [],
    }

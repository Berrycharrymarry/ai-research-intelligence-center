"""OpenAlex REST client (no API key)."""
from __future__ import annotations

import logging
import re
import time

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

USER_AGENT = "AI-Research-Intelligence-Center/1.0 (mailto:research-intel@example.com)"


def _client() -> httpx.Client:
    return httpx.Client(timeout=30.0, headers={"User-Agent": USER_AGENT})


def _get_with_retry(client: httpx.Client, url: str, params: dict, max_retries: int = 3) -> dict:
    delay = 1.0
    for attempt in range(max_retries):
        try:
            r = client.get(url, params=params)
        except httpx.HTTPError as e:
            logger.warning("OpenAlex request error (attempt %d/%d): %s", attempt + 1, max_retries, e)
            time.sleep(delay)
            delay = min(delay * 2, 20.0)
            continue
        if r.status_code == 200:
            return r.json()
        if r.status_code in (429, 500, 502, 503, 504):
            retry_after = r.headers.get("Retry-After")
            try:
                # Cap the sleep: some providers send multi-hour Retry-After values.
                wait = min(float(retry_after), 20.0) if retry_after else delay
            except ValueError:
                wait = delay
            logger.warning("OpenAlex HTTP %s on %s; sleeping %.1fs", r.status_code, url, wait)
            time.sleep(wait)
            delay = min(delay * 2, 20.0)
            continue
        # e.g. 404: no point retrying — propagate immediately
        r.raise_for_status()
    raise RuntimeError(f"OpenAlex request failed after {max_retries} attempts: {url}")


def search_works(query: str, max_results: int, per_page: int = 100) -> list[dict]:
    """Fetch up to max_results works matching a full-text query."""
    works: list[dict] = []
    cursor = "*"
    client = _client()
    try:
        while len(works) < max_results:
            params = {
                "search": query,
                "per-page": min(per_page, max_results - len(works)),
                "sort": "relevance_score:desc",
                "cursor": cursor,
                "mailto": settings.openalex_mailto,
            }
            data = _get_with_retry(client, f"{settings.openalex_base_url}/works", params)
            results = data.get("results") or []
            if not results:
                break
            works.extend(results)
            cursor = (data.get("meta") or {}).get("next_cursor")
            if not cursor:
                break
            time.sleep(settings.request_interval)
        return works
    finally:
        client.close()


def fetch_by_id(work_id: str) -> dict | None:
    """Fetch a single work by OpenAlex id (e.g. W4387835442 or full URL)."""
    wid = work_id.rstrip("/").split("/")[-1]
    client = _client()
    try:
        try:
            data = _get_with_retry(
                client,
                f"{settings.openalex_base_url}/works/{wid}",
                {"mailto": settings.openalex_mailto},
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
                {"mailto": settings.openalex_mailto},
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

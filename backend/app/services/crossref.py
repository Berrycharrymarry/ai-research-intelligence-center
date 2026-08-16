"""Crossref REST client (no key). Used for discovery when OpenAlex search is throttled,
and as a supplementary discovery source."""
from __future__ import annotations

import hashlib
import logging
import re
import time

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

BASE = "https://api.crossref.org"
USER_AGENT = "AI-Research-Intelligence-Center/1.0 (mailto:research-intel@example.com)"

_TYPE_MAP = {
    "journal-article": "article",
    "proceedings-article": "conference-paper",
    "book-chapter": "book-chapter",
    "posted-content": "preprint",
}


def norm_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    d = doi.strip().lower()
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d)
    d = re.sub(r"^doi:\s*", "", d)
    return d or None


def _client() -> httpx.Client:
    return httpx.Client(timeout=30.0, headers={"User-Agent": USER_AGENT})


def _strip_jats(xml: str | None) -> str | None:
    if not xml:
        return None
    text = re.sub(r"<[^>]+>", " ", xml)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def _date_from_parts(parts) -> tuple[str | None, int | None]:
    try:
        flat = parts[0]
        y = int(flat[0])
        m = int(flat[1]) if len(flat) > 1 else 1
        d = int(flat[2]) if len(flat) > 2 else 1
        return f"{y:04d}-{m:02d}-{d:02d}", y
    except (TypeError, ValueError, IndexError):
        return None, None


def parse_work(item: dict) -> dict:
    doi = norm_doi(item.get("DOI"))
    title = (item.get("title") or [None])[0] or "(untitled)"
    abstract = _strip_jats(item.get("abstract"))
    date_parts = (item.get("issued") or {}).get("date-parts") or (
        item.get("published") or {}
    ).get("date-parts")
    pub_date, year = _date_from_parts(date_parts) if date_parts else (None, None)
    authors = []
    for a in item.get("author") or []:
        name = " ".join(x for x in [a.get("given"), a.get("family")] if x).strip()
        if name:
            authors.append(
                {"openalex_author_id": None, "name": name, "institution": None, "country": None}
            )
    concepts = [{"name": s, "score": 0.5} for s in (item.get("subject") or []) if s]
    refs = []
    for r in item.get("reference") or []:
        d = norm_doi(r.get("DOI"))
        if d:
            refs.append(f"CR:{d}")
    oid = (
        f"CR:{doi}"
        if doi
        else f"CR:t-{hashlib.md5(title.encode('utf-8')).hexdigest()[:12]}"
    )
    ctype = item.get("type")
    return {
        "openalex_id": oid,
        "title": title,
        "abstract": abstract,
        "publication_date": pub_date,
        "publication_year": year,
        "cited_by_count": item.get("is-referenced-by-count") or 0,
        "doi": f"https://doi.org/{doi}" if doi else None,
        "url": item.get("URL") or (f"https://doi.org/{doi}" if doi else None),
        "pdf_url": None,
        "arxiv_id": None,
        "type": _TYPE_MAP.get(ctype or "", ctype),
        "authors": authors,
        "concepts": concepts,
        "referenced_works": refs,
    }


def search_works(query: str, max_results: int, per_page: int = 100) -> list[dict]:
    out: list[dict] = []
    cursor = "*"
    client = _client()
    try:
        while len(out) < max_results:
            params = {
                "query": query,
                "rows": min(per_page, max_results - len(out)),
                "cursor": cursor,
                "mailto": settings.openalex_mailto,
                "select": (
                    "DOI,title,abstract,issued,published,is-referenced-by-count,"
                    "author,subject,type,URL,reference"
                ),
            }
            data = None
            for attempt in range(3):
                try:
                    r = client.get(f"{BASE}/works", params=params)
                    if r.status_code == 200:
                        data = r.json()
                        break
                    if r.status_code == 429:
                        time.sleep(min(2**attempt, 8))
                        continue
                    r.raise_for_status()
                except httpx.HTTPError as e:
                    logger.warning("Crossref request error (attempt %d): %s", attempt + 1, e)
                    time.sleep(min(2**attempt, 8))
            if data is None:
                raise RuntimeError("Crossref request failed after retries")
            message = data.get("message") or {}
            items = message.get("items") or []
            if not items:
                break
            out.extend(items)
            cursor = message.get("next-cursor")
            if not cursor:
                break
            time.sleep(0.4)
        return [parse_work(i) for i in out]
    finally:
        client.close()

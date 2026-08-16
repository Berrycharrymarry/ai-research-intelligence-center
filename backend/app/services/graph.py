"""Knowledge graph construction (computed on demand, not persisted)."""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict

from sqlalchemy.orm import Session

from ..models import Paper, PaperAuthor, PaperTopic, Author, Topic


def _norm_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi.strip().lower())
    return d or None


def _ref_key(ref: str) -> tuple[str | None, str]:
    if ref.startswith("https://openalex.org/"):
        return (None, ref)
    if ref.startswith("CR:"):
        return ("doi", ref[3:].lower())
    if ref.startswith("10."):
        return ("doi", ref.lower())
    return (None, ref)


def build_graph(
    db: Session,
    project_id: int,
    papers_limit: int = 120,
    authors_limit: int = 40,
    topics_limit: int = 15,
) -> dict:
    nodes: list[dict] = []
    edges: list[dict] = []
    edge_seen: set[tuple[str, str]] = set()

    def add_edge(source: str, target: str, relation: str) -> None:
        key = (source, target)
        if key in edge_seen:
            return
        edge_seen.add(key)
        edges.append({"data": {"id": f"e{len(edges)}", "source": source, "target": target, "relation": relation}})

    # ---- papers ----
    papers = (
        db.query(Paper)
        .filter(Paper.project_id == project_id)
        .order_by(Paper.cited_by_count.desc(), Paper.publication_year.desc())
        .limit(papers_limit)
        .all()
    )
    paper_nodes = {}
    match_keys: dict[tuple, str] = {}
    for p in papers:
        nid = f"paper:{p.id}"
        paper_nodes[p.id] = nid
        match_keys[(None, p.openalex_id)] = nid
        doi = _norm_doi(p.doi)
        if doi:
            match_keys[("doi", doi)] = nid
        nodes.append(
            {
                "data": {
                    "id": nid,
                    "label": _short_title(p.title),
                    "name": p.title,
                    "type": "paper",
                    "size": 8 + math.log2(1 + p.cited_by_count),
                    "year": p.publication_year,
                    "citations": p.cited_by_count,
                }
            }
        )

    # ---- authors ----
    author_counts: Counter = Counter()
    for p in papers:
        for aid, in db.query(PaperAuthor.author_id).filter(PaperAuthor.paper_id == p.id).all():
            author_counts[aid] += 1
    top_authors = author_counts.most_common(authors_limit)
    author_nodes = {}
    for aid, count in top_authors:
        a = db.get(Author, aid)
        if a is None:
            continue
        nid = f"author:{aid}"
        author_nodes[aid] = nid
        nodes.append(
            {
                "data": {
                    "id": nid,
                    "label": a.name,
                    "name": a.name,
                    "type": "author",
                    "size": 6 + math.log2(1 + count),
                    "institution": a.institution,
                    "papers": count,
                }
            }
        )

    # ---- topics (derived) and technologies (concepts) ----
    topics = db.query(Topic).filter(Topic.project_id == project_id).all()
    topic_paper_counts = _topic_paper_counts(db, project_id)
    topic_nodes: dict[int, str] = {}
    for t in topics:
        count = topic_paper_counts.get(t.id, 0)
        if t.kind == "concept":
            nid = f"tech:{t.id}"
            ntype = "technology"
        else:
            nid = f"topic:{t.id}"
            ntype = "topic"
        topic_nodes[t.id] = (nid, ntype)
        nodes.append(
            {
                "data": {
                    "id": nid,
                    "label": t.name,
                    "name": t.name,
                    "type": ntype,
                    "size": 6 + math.log2(1 + count),
                    "papers": count,
                    "kind": t.kind,
                }
            }
        )

    # ---- edges: authored_by / belongs_to / uses ----
    for p in papers:
        for aid, in db.query(PaperAuthor.author_id).filter(PaperAuthor.paper_id == p.id).all():
            if aid in author_nodes:
                add_edge(paper_nodes[p.id], author_nodes[aid], "authored_by")
        for tid, in db.query(PaperTopic.topic_id).filter(PaperTopic.paper_id == p.id).all():
            if tid in topic_nodes:
                nid, ntype = topic_nodes[tid]
                add_edge(paper_nodes[p.id], nid, "uses" if ntype == "technology" else "belongs_to")

    # ---- edges: cites (real intra-corpus citations) ----
    for p in papers:
        refs = json.loads(p.references_json or "[]")
        added = 0
        for ref in refs:
            target = match_keys.get(_ref_key(ref))
            if target and target != paper_nodes[p.id]:
                add_edge(paper_nodes[p.id], target, "cites")
                added += 1
                if added >= 15:
                    break

    # ---- edges: related_to (shared-topic similarity, thresholded + capped per paper) ----
    vectors: dict[int, dict[int, float]] = defaultdict(dict)
    for p in papers:
        for tid, score in db.query(PaperTopic.topic_id, PaperTopic.score).filter(PaperTopic.paper_id == p.id).all():
            vectors[p.id][tid] = score
    ids = [p.id for p in papers]
    neighbors: dict[int, list[tuple[float, int]]] = defaultdict(list)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            sim = _cosine(vectors[ids[i]], vectors[ids[j]])
            if sim >= 0.45:
                neighbors[ids[i]].append((sim, ids[j]))
                neighbors[ids[j]].append((sim, ids[i]))
    kept: set[tuple[int, int]] = set()
    for a, lst in neighbors.items():
        for _, b in sorted(lst, reverse=True)[:2]:
            kept.add((min(a, b), max(a, b)))
    for a, b in kept:
        add_edge(paper_nodes[a], paper_nodes[b], "related_to")

    return {"nodes": nodes, "edges": edges}


def _topic_paper_counts(db: Session, project_id: int) -> dict[int, int]:
    rows = (
        db.query(PaperTopic.topic_id)
        .join(Paper, Paper.id == PaperTopic.paper_id)
        .filter(Paper.project_id == project_id)
        .all()
    )
    counts: Counter = Counter()
    for (tid,) in rows:
        counts[tid] += 1
    return dict(counts)


def _cosine(a: dict[int, float], b: dict[int, float]) -> float:
    if not a or not b:
        return 0.0
    common = set(a) & set(b)
    if not common:
        return 0.0
    dot = sum(a[k] * b[k] for k in common)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _short_title(title: str, limit: int = 48) -> str:
    t = (title or "").strip()
    return t if len(t) <= limit else t[: limit - 1] + "…"

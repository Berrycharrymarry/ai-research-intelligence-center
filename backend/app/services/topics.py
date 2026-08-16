"""Deterministic topic derivation.

Two complementary signals, both domain-agnostic:
  * concept topics  — aggregated OpenAlex concepts (external, curated taxonomy)
  * derived topics  — technical n-grams clustered from titles + abstracts

Papers are attached to topics with a score in [0, 1].
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter

from sqlalchemy.orm import Session

from ..models import Paper, PaperTopic, Topic

# Overly generic concepts that add little signal to a landscape view.
_GENERIC_CONCEPTS = {
    "computer science", "artificial intelligence", "machine learning", "engineering",
    "mathematics", "physics", "data science", "theoretical computer science", "algorithm",
    "operating system", "distributed computing", "programming language", "software",
    "human\u2013computer interaction", "computer vision", "natural language processing",
    "information retrieval", "deep learning",
}

# Function words — never allowed anywhere inside a topic phrase.
_HARD_STOP = {
    "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by", "as",
    "is", "are", "was", "were", "be", "been", "being", "it", "its", "we", "they", "he",
    "she", "which", "who", "what", "when", "where", "how", "why", "not", "no", "yes",
    "do", "does", "did", "will", "would", "can", "could", "should", "may", "might",
    "must", "shall", "than", "then", "rather", "so", "very", "just", "also", "for",
    "with", "from", "into", "over", "under", "about", "between", "during", "beyond",
    "their", "our", "your", "this", "that", "these", "those", "some", "many", "more",
    "most", "such", "both", "each", "all", "any", "other", "another", "several", "few",
    "via", "towards", "toward", "without", "within", "across", "among", "through",
    "including",
}

# Generic academic terms — weak as topic cores but allowed inside phrases.
_NGRAM_STOP = _HARD_STOP | {
    "using", "based", "paper", "propose", "proposed", "proposes", "method", "approach",
    "approaches", "results", "result", "show", "shows", "shown", "model", "models",
    "modeling", "modelling", "system", "systems", "task", "tasks", "work", "novel",
    "new", "large", "language", "llm", "llms", "agents", "agent", "towards", "toward",
    "via", "can", "one", "two", "three", "first", "second", "however", "also", "well",
    "used", "use", "uses", "different", "across", "within", "without", "through",
    "including", "among", "recent", "years", "study", "studies", "dataset",
    "benchmark", "benchmarks", "framework", "frameworks", "learning", "improve",
    "improves", "improved", "improving", "performance", "effective", "efficient",
    "efficiency", "generation", "generated", "generative", "for", "with", "from",
    "into", "over", "under", "about", "between", "during", "beyond", "their", "our",
    "your", "this", "that", "these", "those", "some", "many", "more", "most", "such",
    "both", "each", "all", "any", "other", "another", "several", "few", "enable",
    "enables", "enabling", "enabled", "explore", "exploring", "explored", "enhance",
    "enhancing", "enhanced", "driven", "powered", "aided", "assisted", "oriented",
    "aware", "case", "survey", "review", "evaluation", "evaluate", "evaluates",
    "evaluating", "application", "applications", "research", "analysis", "analyses",
    "perspective", "overview", "tutorial", "state-of-the-art", "artificial",
    "intelligence", "deep", "neural", "network", "networks", "large-scale", "compare",
    "comparing", "comparison", "compared", "towards", "multi", "supported", "support",
    "example", "examples", "impact", "role", "roles", "effect", "effects", "evidence",
    "empirical", "experimental", "results", "finding", "findings", "field", "fields",
    "insights", "insight", "implications", "challenges", "challenge", "opportunities",
    "potential", "need", "needs", "future", "current", "state", "design", "designs",
}

_MAX_CONCEPT_TOPICS = 12
_MAX_DERIVED_TOPICS = 12
_CONCEPT_MIN_SCORE = 0.2


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9][a-z0-9-]*", (text or "").lower())


def _ngrams(tokens: list[str], n: int) -> list[str]:
    return [" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1)]


def _titlecase(phrase: str) -> str:
    return " ".join(w.capitalize() for w in phrase.split(" "))


def _valid_phrase(phrase: str) -> bool:
    tokens = phrase.split(" ")
    if any(len(t) < 3 for t in tokens):
        return False
    # Function words never appear in a topic phrase.
    if any(t in _HARD_STOP for t in tokens):
        return False
    nonstop = [t for t in tokens if t not in _NGRAM_STOP]
    # At least one content word, and at most one weak/generic token.
    return len(nonstop) >= 1 and len(tokens) - len(nonstop) <= 1


def _replace_concept_topics(
    db: Session,
    project_id: int,
    paper_concepts: dict[int, list[tuple[str, float]]],
) -> None:
    """Delete and rebuild `concept` topics from per-paper concepts."""
    old = [t.id for t in db.query(Topic).filter(Topic.project_id == project_id, Topic.kind == "concept").all()]
    if old:
        db.query(PaperTopic).filter(PaperTopic.topic_id.in_(old)).delete(synchronize_session=False)
        db.query(Topic).filter(Topic.id.in_(old)).delete(synchronize_session=False)
        db.flush()

    agg: Counter = Counter()
    freq: Counter = Counter()
    for concepts in paper_concepts.values():
        seen: set[str] = set()
        for name, score in concepts:
            name = (name or "").strip()
            if not name or name.lower() in _GENERIC_CONCEPTS:
                continue
            agg[name] += score
            if name not in seen:
                freq[name] += 1
                seen.add(name)

    # Drop single-paper noise (e.g. "(physics)" disambiguations) only once the corpus
    # is large enough that multi-paper concepts are meaningful.
    min_freq = 2 if len(paper_concepts) >= 30 else 1
    top_names = [
        name
        for name, _ in agg.most_common(_MAX_CONCEPT_TOPICS)
        if freq.get(name, 0) >= min_freq
    ]
    existing = {t.name: t for t in db.query(Topic).filter(Topic.project_id == project_id).all()}
    for name in top_names:
        if name not in existing:
            existing[name] = Topic(project_id=project_id, name=name, kind="concept")
            db.add(existing[name])
    db.flush()  # assign ids before linking papers

    for paper_id, concepts in paper_concepts.items():
        for name, score in concepts:
            topic = existing.get(name)
            if topic is None or score < _CONCEPT_MIN_SCORE:
                continue
            db.execute(
                PaperTopic.__table__.insert().prefix_with("OR IGNORE").values(
                    paper_id=paper_id, topic_id=topic.id, score=round(score, 4)
                )
            )


def derive_topics(db: Session, project_id: int) -> None:
    """Replace `derived` and `concept` topics for the project."""
    papers = db.query(Paper).filter(Paper.project_id == project_id).all()
    if not papers:
        return

    # ---- concept topics: rebuild from stored concept data ----
    # Harvest existing concept links first so data survives runs that skip enrichment.
    paper_concepts: dict[int, list[tuple[str, float]]] = {}
    for pid, name, score in (
        db.query(PaperTopic.paper_id, Topic.name, PaperTopic.score)
        .join(Topic, Topic.id == PaperTopic.topic_id)
        .filter(Topic.project_id == project_id, Topic.kind == "concept")
        .all()
    ):
        paper_concepts.setdefault(pid, []).append((name, score))
    for p in papers:
        if not p.concepts_json:
            continue
        try:
            stored = json.loads(p.concepts_json)
        except (ValueError, TypeError):
            stored = []
        for c in stored:
            if isinstance(c, dict) and c.get("name"):
                paper_concepts.setdefault(p.id, []).append(
                    (c.get("name"), c.get("score") or 0.0)
                )
    if paper_concepts:
        _replace_concept_topics(db, project_id, paper_concepts)

    # ---- derived topics: fully re-computable — replace the previous generation ----
    old = [t.id for t in db.query(Topic).filter(Topic.project_id == project_id, Topic.kind == "derived").all()]
    if old:
        db.query(PaperTopic).filter(PaperTopic.topic_id.in_(old)).delete(synchronize_session=False)
        db.query(Topic).filter(Topic.id.in_(old)).delete(synchronize_session=False)
        db.flush()

    doc_count = len(papers)
    title_counter: Counter = Counter()
    abstract_counter: Counter = Counter()
    doc_freq: Counter = Counter()

    for p in papers:
        title_ngrams = set(_ngrams(_tokenize(p.title), 2)) | set(_ngrams(_tokenize(p.title), 3))
        abstract_ngrams = set()
        if p.abstract:
            abs_tokens = _tokenize(p.abstract)
            abstract_ngrams = set(_ngrams(abs_tokens, 2)) | set(_ngrams(abs_tokens, 3))
        for g in title_ngrams:
            if _valid_phrase(g):
                title_counter[g] += 1
        for g in abstract_ngrams:
            if _valid_phrase(g):
                abstract_counter[g] += 1
        for g in (title_ngrams | abstract_ngrams):
            if _valid_phrase(g):
                doc_freq[g] += 1

    scored = []
    for phrase in set(title_counter) | set(abstract_counter):
        weight = 3.0 * title_counter.get(phrase, 0) + 0.6 * abstract_counter.get(phrase, 0)
        if weight < 2.0:
            continue
        idf = 1.0 + math.log((doc_count + 1) / (doc_freq[phrase] + 1))
        scored.append((weight * idf, phrase))
    scored.sort(reverse=True)

    selected: list[str] = []
    used_cores: set[str] = set()
    for _, phrase in scored:
        if len(selected) >= _MAX_DERIVED_TOPICS:
            break
        tokens = phrase.split(" ")
        nonstop = [t for t in tokens if t not in _NGRAM_STOP]
        if not nonstop:
            continue
        # skip near-duplicates: same distinctive core token, or substring overlap
        if len(nonstop) == 1 and nonstop[0] in used_cores:
            continue
        if any(phrase in existing or existing in phrase for existing in selected):
            continue
        selected.append(phrase)
        used_cores.update(nonstop)

    topic_by_name: dict[str, Topic] = {
        t.name: t for t in db.query(Topic).filter(Topic.project_id == project_id).all()
    }
    for phrase in selected:
        name = _titlecase(phrase)
        if name not in topic_by_name:
            topic_by_name[name] = Topic(project_id=project_id, name=name, kind="derived")
            db.add(topic_by_name[name])
    db.flush()  # assign ids before linking papers

    for p in papers:
        title_l = (p.title or "").lower()
        text = f"{title_l} {(p.abstract or '').lower()}"
        for t in topic_by_name.values():
            phrase = t.name.lower()
            score = 0.0
            if phrase in title_l:
                score = 0.9
            elif phrase in text:
                score = 0.5
            if score > 0:
                db.execute(
                    PaperTopic.__table__.insert().prefix_with("OR IGNORE").values(
                        paper_id=p.id, topic_id=t.id, score=score
                    )
                )
    db.commit()

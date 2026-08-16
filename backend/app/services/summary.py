"""Deterministic extractive summarization (no LLM)."""
from __future__ import annotations

import re

_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "of", "to", "in", "on",
    "for", "with", "at", "by", "from", "as", "is", "are", "was", "were", "be", "been",
    "being", "this", "that", "these", "those", "we", "our", "their", "its", "it", "they",
    "have", "has", "had", "do", "does", "did", "will", "would", "can", "could", "should",
    "may", "might", "not", "no", "so", "such", "than", "into", "over", "under", "between",
    "through", "during", "without", "also", "however", "therefore", "thus", "using", "based",
    "propose", "proposed", "method", "approach", "results", "show", "shows", "shown",
    "paper", "model", "models", "system", "systems", "task", "tasks", "work", "via",
    "towards", "toward", "novel", "new", "large", "language",
}


def _tokenize(text: str) -> list[str]:
    return [
        w.lower()
        for w in re.findall(r"[A-Za-z][A-Za-z-]*", text or "")
        if w.lower() not in _STOPWORDS and len(w) > 2
    ]


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", (text or "").strip())
    return [s.strip() for s in parts if len(s.strip()) >= 24]


def summarize(title: str, abstract: str | None, n: int = 2) -> str | None:
    """Return the top `n` sentences of the abstract by a deterministic scoring function."""
    sentences = _sentences(abstract or "")
    if not sentences:
        return None
    if len(sentences) <= n:
        return " ".join(sentences)

    title_words = set(_tokenize(title or ""))
    scored: list[tuple[float, int, str]] = []
    for i, s in enumerate(sentences):
        words = _tokenize(s)
        if not words:
            continue
        tf: dict[str, int] = {}
        for w in words:
            tf[w] = tf.get(w, 0) + 1
        top_terms = sum(sorted(tf.values(), reverse=True)[:3])
        title_overlap = len(set(words) & title_words) / max(1, len(words))
        position = 1.0 if i == 0 else (0.7 if i < 3 else 0.3)
        score = position + 2.0 * title_overlap + 0.5 * top_terms + 0.5 * min(1.0, len(s) / 220)
        scored.append((score, i, s))

    scored.sort(key=lambda x: (-x[0], x[1]))
    chosen = sorted(scored[:n], key=lambda x: x[1])
    return " ".join(s for _, _, s in chosen)

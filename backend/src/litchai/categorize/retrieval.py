"""Hybrid retrieval for few-shot exemplars (Phase 3).

Reciprocal-rank fusion (RRF, k=60) of the pg_trgm and pgvector result lists — a
total ordering over ``category_memory`` rows. This IS the "training on the firm's
samples" mechanism: the exemplars it returns are what rung 4's prompt shows the
LLM. Retrieved ids are returned so the caller can log them.
"""
from __future__ import annotations

from litchai.categorize.memory_store import MemoryRecord, MemoryStore
from litchai.embeddings import Embedder

RRF_K = 60


def _rrf(rank_lists: list[list[int]], k: int = RRF_K) -> dict[int, float]:
    scores: dict[int, float] = {}
    for ranked in rank_lists:
        for position, rec_id in enumerate(ranked):
            scores[rec_id] = scores.get(rec_id, 0.0) + 1.0 / (k + position + 1)
    return scores


def hybrid(
    normalized_text: str,
    client_id: str | None,
    store: MemoryStore,
    embedder: Embedder | None = None,
    *,
    k: int = RRF_K,
    limit: int = 5,
    min_sim: float = 0.3,
    min_cos: float = 0.5,
    pool: int = 30,
) -> list[MemoryRecord]:
    """Top ``limit`` exemplars by RRF of trigram + vector retrieval."""
    tri = store.trigram(normalized_text, client_id, min_sim, limit=pool)
    by_id: dict[int, MemoryRecord] = {r.id: r for r, _ in tri}
    rank_lists = [[r.id for r, _ in tri]]

    if embedder is not None:
        vec = store.vector(embedder.embed_query(normalized_text), client_id, min_cos, limit=pool)
        for r, _ in vec:
            by_id.setdefault(r.id, r)
        rank_lists.append([r.id for r, _ in vec])

    fused = _rrf(rank_lists, k=k)
    ordered = sorted(fused.items(), key=lambda kv: kv[1], reverse=True)
    return [by_id[rec_id] for rec_id, _ in ordered[:limit]]

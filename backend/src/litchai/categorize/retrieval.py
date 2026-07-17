"""Hybrid retrieval for few-shot exemplars (Phase 3) and the Copilot RAG store
(Milestone 8).

Reciprocal-rank fusion (RRF, k=60) of the pg_trgm and pgvector result lists — a
total ordering. For categorisation (:func:`hybrid`) this fuses over
``category_memory`` rows; for the Copilot (:func:`hybrid_knowledge`) it fuses the
same way over ``knowledge_chunk``, applying the scope/client_id filter *first* so
per-client context never leaks. Retrieved ids/chunks are returned so the caller
can build citations and log them.
"""
from __future__ import annotations

from dataclasses import dataclass

from litchai.categorize.memory_store import MemoryRecord, MemoryStore
from litchai.db.repo import KnowledgeChunk, Repository
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


@dataclass(frozen=True)
class RetrievedChunk:
    """A knowledge chunk returned by :func:`hybrid_knowledge`, with its fused RRF
    score and the best raw similarity (max of trigram / cosine) for thresholding
    and citation display. ``section_text`` is the full parent section when
    expanded, else the chunk text."""

    chunk: KnowledgeChunk
    score: float
    similarity: float
    section_text: str

    @property
    def citation(self) -> str:
        return f"{self.chunk.title} — {self.chunk.section}" if self.chunk.section else self.chunk.title


def hybrid_knowledge(
    query: str,
    repo: Repository,
    embedder: Embedder | None = None,
    *,
    client_id: str | None = None,
    k: int = RRF_K,
    limit: int = 5,
    min_sim: float = 0.05,
    min_cos: float = 0.25,
    min_score: float = 0.1,
    pool: int = 30,
    expand_sections: bool = True,
) -> list[RetrievedChunk]:
    """Top ``limit`` knowledge chunks by RRF of trigram + vector retrieval.

    The scope/client filter is enforced inside the repo queries (firm-global rows
    plus, and only, the given client's rows), so it is applied *before* fusion.
    Candidates below ``min_score`` (best raw similarity) are dropped; when
    ``expand_sections`` the full parent section is attached for citation context.
    """
    tri = repo.knowledge_trigram(query, client_id, min_sim, limit=pool)
    best_sim: dict[int, float] = {}
    by_id: dict[int, KnowledgeChunk] = {}
    for c, s in tri:
        by_id[c.id] = c
        best_sim[c.id] = max(best_sim.get(c.id, 0.0), s)
    rank_lists = [[c.id for c, _ in tri]]

    if embedder is not None:
        vec = repo.knowledge_vector(embedder.embed_query(query), client_id, min_cos, limit=pool)
        for c, s in vec:
            by_id.setdefault(c.id, c)
            best_sim[c.id] = max(best_sim.get(c.id, 0.0), s)
        rank_lists.append([c.id for c, _ in vec])

    fused = _rrf(rank_lists, k=k)
    ordered = sorted(fused.items(), key=lambda kv: kv[1], reverse=True)

    results: list[RetrievedChunk] = []
    for chunk_id, score in ordered:
        sim = best_sim.get(chunk_id, 0.0)
        if sim < min_score:
            continue
        chunk = by_id[chunk_id]
        section_text = chunk.text
        if expand_sections:
            siblings = repo.knowledge_section(chunk.source_id, chunk.section)
            if siblings:
                section_text = "\n\n".join(s.text for s in siblings)
        results.append(RetrievedChunk(chunk=chunk, score=score, similarity=sim, section_text=section_text))
        if len(results) >= limit:
            break
    return results

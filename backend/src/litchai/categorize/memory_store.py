"""category_memory retrieval store (Phase 3) — what the ladder queries.

Unifies seeds, human corrections and approved runs into one weighted, client-
scoped-or-global store. Rungs 1–3 read it; the HITL correction loop writes to it
(the learning mechanism, FR8). Two implementations behind one protocol:

* :class:`InMemoryStore` — trigram-Jaccard + cosine in pure Python, standing in
  for pg_trgm / pgvector so the ladder is fully testable without Postgres.
* :class:`PgMemoryStore` — the real ``category_memory`` table with a GIN trigram
  index and an HNSW vector index (VM).

Client scoping: a query sees the client's own rows **and** firm-global rows
(``client_id IS NULL``); stale rows (post-taxonomy-split) are excluded.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from litchai.categorize.normalize import NORMALIZER_VERSION
from litchai.embeddings import cosine


@dataclass(frozen=True)
class MemoryRecord:
    id: int
    normalized_text: str
    category_code: str
    source: str                      # seed_template | seed_history | human_correction | approved_run
    client_id: str | None = None     # None = firm-global
    weight: float = 1.0
    embedding: list[float] | None = None
    taxonomy_version: str | None = None
    normalizer_version: str = NORMALIZER_VERSION
    embedding_model: str | None = None
    stale: bool = False


@runtime_checkable
class MemoryStore(Protocol):
    def add(self, record: MemoryRecord) -> MemoryRecord: ...

    def exact(self, normalized_text: str, client_id: str | None) -> list[MemoryRecord]: ...

    def trigram(
        self, normalized_text: str, client_id: str | None, min_sim: float, limit: int = 20
    ) -> list[tuple[MemoryRecord, float]]: ...

    def vector(
        self, embedding: list[float], client_id: str | None, min_cos: float, limit: int = 20
    ) -> list[tuple[MemoryRecord, float]]: ...

    def all_records(self) -> list[MemoryRecord]: ...


# --- trigram similarity (pg_trgm-compatible enough for routing) -------------


def _trigrams(text: str) -> set[str]:
    """pg_trgm-style: pad and slice into 3-grams. Faithful enough that the
    in-memory routing matches the VM's relative ordering."""
    padded = f"  {text.strip()} "
    return {padded[i : i + 3] for i in range(len(padded) - 2)} if len(padded) >= 3 else set()


def trigram_similarity(a: str, b: str) -> float:
    ta, tb = _trigrams(a), _trigrams(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    union = len(ta | tb)
    return inter / union if union else 0.0


class InMemoryStore:
    def __init__(self) -> None:
        self._records: dict[int, MemoryRecord] = {}
        self._seq = 0

    def add(self, record: MemoryRecord) -> MemoryRecord:
        self._seq += 1
        stored = MemoryRecord(**{**record.__dict__, "id": self._seq})
        self._records[stored.id] = stored
        return stored

    def _scoped(self, client_id: str | None):
        for rec in self._records.values():
            if rec.stale:
                continue
            if rec.client_id is None or rec.client_id == client_id:
                yield rec

    def exact(self, normalized_text: str, client_id: str | None) -> list[MemoryRecord]:
        return [r for r in self._scoped(client_id) if r.normalized_text == normalized_text]

    def trigram(
        self, normalized_text: str, client_id: str | None, min_sim: float, limit: int = 20
    ) -> list[tuple[MemoryRecord, float]]:
        scored = [
            (r, trigram_similarity(normalized_text, r.normalized_text))
            for r in self._scoped(client_id)
        ]
        hits = [(r, s) for r, s in scored if s >= min_sim]
        hits.sort(key=lambda rs: rs[1], reverse=True)
        return hits[:limit]

    def vector(
        self, embedding: list[float], client_id: str | None, min_cos: float, limit: int = 20
    ) -> list[tuple[MemoryRecord, float]]:
        scored = [
            (r, cosine(embedding, r.embedding))
            for r in self._scoped(client_id)
            if r.embedding is not None
        ]
        hits = [(r, c) for r, c in scored if c >= min_cos]
        hits.sort(key=lambda rc: rc[1], reverse=True)
        return hits[:limit]

    def all_records(self) -> list[MemoryRecord]:
        return list(self._records.values())

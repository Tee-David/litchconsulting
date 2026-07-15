"""PgMemoryStore (Phase 3) — the ``category_memory`` table on the VM.

Same protocol as :class:`~litchai.categorize.memory_store.InMemoryStore`; here
trigram is ``pg_trgm.similarity`` over the GIN index and vector is pgvector
cosine over the HNSW index. Import-safe without a database (psycopg is installed);
runs on the VM. Client scoping (own + global, non-stale) is enforced in SQL.
"""
from __future__ import annotations

import psycopg

from litchai.categorize.memory_store import MemoryRecord

_COLS = (
    "id, normalized_text, category_code, source, client_id, weight, embedding_model, "
    "taxonomy_version, normalizer_version, stale"
)


def _record(row: dict, embedding: list[float] | None = None) -> MemoryRecord:
    return MemoryRecord(
        id=row["id"],
        normalized_text=row["normalized_text"],
        category_code=row["category_code"],
        source=row["source"],
        client_id=str(row["client_id"]) if row["client_id"] is not None else None,
        weight=float(row["weight"]),
        embedding=embedding,
        taxonomy_version=row["taxonomy_version"],
        normalizer_version=row["normalizer_version"],
        embedding_model=row["embedding_model"],
        stale=row["stale"],
    )


def _vec_literal(embedding: list[float]) -> str:
    return "[" + ",".join(repr(x) for x in embedding) + "]"


class PgMemoryStore:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def add(self, record: MemoryRecord) -> MemoryRecord:
        emb = _vec_literal(record.embedding) if record.embedding is not None else None
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO category_memory (normalized_text, embedding, embedding_model, "
                "normalizer_version, category_code, taxonomy_version, source, client_id, weight, stale) "
                "VALUES (%s, %s::vector, %s, %s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (normalized_text, category_code, source, client_id) "
                "DO UPDATE SET weight = category_memory.weight + EXCLUDED.weight, stale = false "
                f"RETURNING {_COLS}",
                (
                    record.normalized_text, emb, record.embedding_model, record.normalizer_version,
                    record.category_code, record.taxonomy_version, record.source, record.client_id,
                    record.weight, record.stale,
                ),
            )
            return _record(cur.fetchone(), record.embedding)

    def exact(self, normalized_text: str, client_id: str | None) -> list[MemoryRecord]:
        with self.conn.cursor() as cur:
            cur.execute(
                f"SELECT {_COLS} FROM category_memory WHERE normalized_text = %s "
                "AND (client_id = %s OR client_id IS NULL) AND NOT stale",
                (normalized_text, client_id),
            )
            return [_record(r) for r in cur.fetchall()]

    def trigram(
        self, normalized_text: str, client_id: str | None, min_sim: float, limit: int = 20
    ) -> list[tuple[MemoryRecord, float]]:
        with self.conn.cursor() as cur:
            cur.execute(
                f"SELECT {_COLS}, similarity(normalized_text, %s) AS sim FROM category_memory "
                "WHERE (client_id = %s OR client_id IS NULL) AND NOT stale "
                "AND similarity(normalized_text, %s) >= %s ORDER BY sim DESC LIMIT %s",
                (normalized_text, client_id, normalized_text, min_sim, limit),
            )
            return [(_record(r), float(r["sim"])) for r in cur.fetchall()]

    def vector(
        self, embedding: list[float], client_id: str | None, min_cos: float, limit: int = 20
    ) -> list[tuple[MemoryRecord, float]]:
        vec = _vec_literal(embedding)
        with self.conn.cursor() as cur:
            cur.execute(
                f"SELECT {_COLS}, 1 - (embedding <=> %s::vector) AS cos FROM category_memory "
                "WHERE embedding IS NOT NULL AND (client_id = %s OR client_id IS NULL) AND NOT stale "
                "AND 1 - (embedding <=> %s::vector) >= %s ORDER BY embedding <=> %s::vector LIMIT %s",
                (vec, client_id, vec, min_cos, vec, limit),
            )
            return [(_record(r), float(r["cos"])) for r in cur.fetchall()]

    def all_records(self) -> list[MemoryRecord]:
        with self.conn.cursor() as cur:
            cur.execute(f"SELECT {_COLS} FROM category_memory")
            return [_record(r) for r in cur.fetchall()]

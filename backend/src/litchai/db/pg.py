"""psycopg :class:`Repository` — the production seam on the VM's Postgres.

Import-safe without a database (psycopg is installed); *connecting* needs the
VM's Postgres + pgvector + pg_trgm. The behavioural contract is the same as
:class:`litchai.db.memory.InMemoryRepository`; SQL mirrors ``db/schema.sql``.
The state machine is enforced by reusing :func:`litchai.documents.state.transition`
under a ``SELECT … FOR UPDATE`` so two workers can't race a status change.
"""
from __future__ import annotations

import os
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from litchai.db.repo import (
    Document,
    Engagement,
    GeneratedFile,
    KnowledgeChunk,
    LineItem,
    RepositoryError,
)
from litchai.documents.state import AuditEntry, DocumentStatus, transition


def connect(conninfo: str | None = None) -> psycopg.Connection:
    dsn = conninfo or os.environ.get("LITCHAI_DATABASE_URL", "")
    if not dsn:
        raise RepositoryError("LITCHAI_DATABASE_URL is not set")
    return psycopg.connect(dsn, autocommit=True, row_factory=dict_row)


def _document(row: dict[str, Any]) -> Document:
    return Document(
        id=row["id"],
        engagement_id=row["engagement_id"],
        client_id=str(row["client_id"]),
        filename=row["filename"],
        mime=row["mime"],
        source_hash=row["source_hash"],
        byte_size=row["byte_size"],
        status=row["status"],
        progress=row["progress"] or {},
        extraction_engine=row["extraction_engine"],
        account_label=row["account_label"],
        period_start=row["period_start"],
        period_end=row["period_end"],
        created_at=row["created_at"],
    )


def _engagement(row: dict[str, Any]) -> Engagement:
    return Engagement(
        id=row["id"],
        client_id=str(row["client_id"]),
        period_label=row["period_label"],
        template=row["template"],
        aux_inputs=row["aux_inputs"],
        materiality=float(row["materiality"]) if row["materiality"] is not None else None,
        status=row["status"],
        created_at=row["created_at"],
    )


_DOC_COLS = (
    "id, engagement_id, client_id, filename, mime, source_hash, byte_size, status, "
    "progress, extraction_engine, account_label, period_start, period_end, created_at"
)

_KNOWLEDGE_COLS = (
    "id, source_type, source_id, title, section, text, tokens, scope, client_id, "
    "content_hash, updated_at"
)


def _vec_literal(embedding: list[float]) -> str:
    return "[" + ",".join(repr(x) for x in embedding) + "]"


def _knowledge(row: dict[str, Any], embedding: list[float] | None = None) -> KnowledgeChunk:
    return KnowledgeChunk(
        id=row["id"],
        source_type=row["source_type"],
        source_id=row["source_id"],
        title=row["title"],
        section=row["section"],
        text=row["text"],
        tokens=row["tokens"],
        scope=row["scope"],
        client_id=str(row["client_id"]) if row["client_id"] is not None else None,
        content_hash=row["content_hash"],
        embedding=embedding,
        updated_at=row["updated_at"],
    )


class PostgresRepository:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    # --- knowledge chunks (Copilot RAG store, Milestone 8) -----------------
    def upsert_knowledge_chunk(self, chunk: KnowledgeChunk) -> KnowledgeChunk:
        emb = _vec_literal(chunk.embedding) if chunk.embedding is not None else None
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO knowledge_chunk (source_type, source_id, title, section, text, "
                "embedding, tokens, scope, client_id, content_hash) "
                "VALUES (%s,%s,%s,%s,%s,%s::vector,%s,%s,%s,%s) "
                "ON CONFLICT (content_hash) DO UPDATE SET "
                "source_type = EXCLUDED.source_type, source_id = EXCLUDED.source_id, "
                "title = EXCLUDED.title, section = EXCLUDED.section, text = EXCLUDED.text, "
                "embedding = EXCLUDED.embedding, tokens = EXCLUDED.tokens, scope = EXCLUDED.scope, "
                "client_id = EXCLUDED.client_id, updated_at = now() "
                f"RETURNING {_KNOWLEDGE_COLS}",
                (
                    chunk.source_type, chunk.source_id, chunk.title, chunk.section, chunk.text,
                    emb, chunk.tokens, chunk.scope, chunk.client_id, chunk.content_hash,
                ),
            )
            return _knowledge(cur.fetchone(), chunk.embedding)

    def get_knowledge_chunk(self, chunk_id: int) -> KnowledgeChunk | None:
        with self.conn.cursor() as cur:
            cur.execute(f"SELECT {_KNOWLEDGE_COLS} FROM knowledge_chunk WHERE id = %s", (chunk_id,))
            row = cur.fetchone()
            return _knowledge(row) if row else None

    def list_knowledge_chunks(
        self, *, source_type: str | None = None, scope: str | None = None, limit: int = 1000
    ) -> list[KnowledgeChunk]:
        clauses, params = [], []
        if source_type is not None:
            clauses.append("source_type = %s")
            params.append(source_type)
        if scope is not None:
            clauses.append("scope = %s")
            params.append(scope)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        with self.conn.cursor() as cur:
            cur.execute(
                f"SELECT {_KNOWLEDGE_COLS} FROM knowledge_chunk {where} ORDER BY id LIMIT %s",
                tuple(params),
            )
            return [_knowledge(r) for r in cur.fetchall()]

    def knowledge_trigram(
        self, query: str, client_id: str | None, min_sim: float, limit: int = 20
    ) -> list[tuple[KnowledgeChunk, float]]:
        with self.conn.cursor() as cur:
            cur.execute(
                f"SELECT {_KNOWLEDGE_COLS}, similarity(text, %s) AS sim FROM knowledge_chunk "
                "WHERE (scope = 'firm' OR client_id = %s) AND similarity(text, %s) >= %s "
                "ORDER BY sim DESC LIMIT %s",
                (query, client_id, query, min_sim, limit),
            )
            return [(_knowledge(r), float(r["sim"])) for r in cur.fetchall()]

    def knowledge_vector(
        self, embedding: list[float], client_id: str | None, min_cos: float, limit: int = 20
    ) -> list[tuple[KnowledgeChunk, float]]:
        vec = _vec_literal(embedding)
        with self.conn.cursor() as cur:
            cur.execute(
                f"SELECT {_KNOWLEDGE_COLS}, 1 - (embedding <=> %s::vector) AS cos FROM knowledge_chunk "
                "WHERE embedding IS NOT NULL AND (scope = 'firm' OR client_id = %s) "
                "AND 1 - (embedding <=> %s::vector) >= %s ORDER BY embedding <=> %s::vector LIMIT %s",
                (vec, client_id, vec, min_cos, vec, limit),
            )
            return [(_knowledge(r), float(r["cos"])) for r in cur.fetchall()]

    def knowledge_section(self, source_id: str, section: str | None) -> list[KnowledgeChunk]:
        with self.conn.cursor() as cur:
            if section is None:
                cur.execute(
                    f"SELECT {_KNOWLEDGE_COLS} FROM knowledge_chunk "
                    "WHERE source_id = %s AND section IS NULL ORDER BY id",
                    (source_id,),
                )
            else:
                cur.execute(
                    f"SELECT {_KNOWLEDGE_COLS} FROM knowledge_chunk "
                    "WHERE source_id = %s AND section = %s ORDER BY id",
                    (source_id, section),
                )
            return [_knowledge(r) for r in cur.fetchall()]

    def delete_knowledge(
        self, *, source_type: str | None = None, scope: str | None = None, client_id: str | None = None
    ) -> int:
        clauses, params = [], []
        if source_type is not None:
            clauses.append("source_type = %s")
            params.append(source_type)
        if scope is not None:
            clauses.append("scope = %s")
            params.append(scope)
        if client_id is not None:
            clauses.append("client_id = %s")
            params.append(client_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self.conn.cursor() as cur:
            cur.execute(f"DELETE FROM knowledge_chunk {where}", tuple(params))
            return cur.rowcount

    # --- engagements -------------------------------------------------------
    def create_engagement(
        self,
        client_id: str,
        period_label: str,
        template: str,
        aux_inputs: dict[str, Any] | None = None,
        materiality: float | None = None,
    ) -> Engagement:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO engagements (client_id, period_label, template, aux_inputs, materiality) "
                "VALUES (%s, %s, %s, %s, %s) "
                "RETURNING id, client_id, period_label, template, aux_inputs, materiality, status, created_at",
                (client_id, period_label, template, Jsonb(aux_inputs) if aux_inputs else None, materiality),
            )
            return _engagement(cur.fetchone())

    def get_engagement(self, engagement_id: int) -> Engagement | None:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT id, client_id, period_label, template, aux_inputs, materiality, status, created_at "
                "FROM engagements WHERE id = %s",
                (engagement_id,),
            )
            row = cur.fetchone()
            return _engagement(row) if row else None

    def transition_engagement(
        self, engagement_id: int, to_status: str, detail: dict[str, Any] | None = None
    ) -> Engagement:
        from litchai.documents.engagement_state import transition as eng_transition

        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.execute("SELECT status FROM engagements WHERE id = %s FOR UPDATE", (engagement_id,))
            row = cur.fetchone()
            if row is None:
                raise RepositoryError(f"unknown engagement {engagement_id}")
            entry = eng_transition(engagement_id, row["status"], to_status, detail)
            cur.execute("UPDATE engagements SET status = %s WHERE id = %s", (entry.to_state, engagement_id))
            cur.execute(
                "INSERT INTO audit_log (entity, entity_id, from_state, to_state, detail) "
                "VALUES ('engagement', %s, %s, %s, %s)",
                (engagement_id, entry.from_state, entry.to_state, Jsonb(entry.detail)),
            )
            cur.execute(
                "SELECT id, client_id, period_label, template, aux_inputs, materiality, status, created_at "
                "FROM engagements WHERE id = %s",
                (engagement_id,),
            )
            return _engagement(cur.fetchone())

    def latest_generated_file(self, engagement_id: int) -> GeneratedFile | None:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT id, engagement_id, template, compiler_version, validation_status, "
                "hitl_status, sha256, created_at FROM generated_files WHERE engagement_id = %s "
                "ORDER BY created_at DESC, id DESC LIMIT 1",
                (engagement_id,),
            )
            row = cur.fetchone()
        return GeneratedFile(**row) if row else None

    def set_generated_file_hitl_status(self, generated_file_id: int, hitl_status: str) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE generated_files SET hitl_status = %s WHERE id = %s",
                (hitl_status, generated_file_id),
            )

    def mark_engagement_deliverable(self, engagement_id: int) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE generated_files SET hitl_status = 'approved' WHERE engagement_id = %s",
                (engagement_id,),
            )
            return cur.rowcount

    # --- documents ---------------------------------------------------------
    def create_document(
        self,
        client_id: str,
        filename: str,
        mime: str,
        source_hash: str,
        byte_size: int | None = None,
        engagement_id: int | None = None,
        account_label: str | None = None,
    ) -> Document:
        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO documents (engagement_id, client_id, filename, mime, source_hash, "
                "byte_size, account_label) VALUES (%s, %s, %s, %s, %s, %s, %s) "
                f"RETURNING {_DOC_COLS}",
                (engagement_id, client_id, filename, mime, source_hash, byte_size, account_label),
            )
            doc = _document(cur.fetchone())
            cur.execute(
                "INSERT INTO audit_log (entity, entity_id, from_state, to_state, detail) "
                "VALUES ('document', %s, NULL, %s, %s)",
                (doc.id, DocumentStatus.RECEIVED.value, Jsonb({"filename": filename})),
            )
            return doc

    def get_document(self, document_id: int) -> Document | None:
        with self.conn.cursor() as cur:
            cur.execute(f"SELECT {_DOC_COLS} FROM documents WHERE id = %s", (document_id,))
            row = cur.fetchone()
            return _document(row) if row else None

    def find_document_by_hash(self, client_id: str, source_hash: str) -> Document | None:
        with self.conn.cursor() as cur:
            cur.execute(
                f"SELECT {_DOC_COLS} FROM documents WHERE client_id = %s AND source_hash = %s "
                "ORDER BY id DESC LIMIT 1",
                (client_id, source_hash),
            )
            row = cur.fetchone()
            return _document(row) if row else None

    def list_documents(self, client_id: str | None = None, limit: int = 100) -> list[Document]:
        with self.conn.cursor() as cur:
            if client_id is None:
                cur.execute(f"SELECT {_DOC_COLS} FROM documents ORDER BY id DESC LIMIT %s", (limit,))
            else:
                cur.execute(
                    f"SELECT {_DOC_COLS} FROM documents WHERE client_id = %s ORDER BY id DESC LIMIT %s",
                    (client_id, limit),
                )
            return [_document(r) for r in cur.fetchall()]

    def delete_client_data(self, client_id: str) -> dict[str, int]:
        with self.conn.transaction(), self.conn.cursor() as cur:
            # line_items/extraction_chunks/categorization_events cascade from documents (ON DELETE CASCADE);
            # corrections keep line_item_id but SET NULL — delete them explicitly for this client.
            cur.execute(
                "DELETE FROM corrections WHERE line_item_id IN (SELECT li.id FROM line_items li "
                "JOIN documents d ON d.id = li.document_id WHERE d.client_id = %s)",
                (client_id,),
            )
            cur.execute("DELETE FROM documents WHERE client_id = %s", (client_id,))
            documents = cur.rowcount
            cur.execute(
                "DELETE FROM generated_files WHERE engagement_id IN "
                "(SELECT id FROM engagements WHERE client_id = %s)",
                (client_id,),
            )
            cur.execute("DELETE FROM engagements WHERE client_id = %s", (client_id,))
            engagements = cur.rowcount
            return {"documents": documents, "engagements": engagements}

    def transition_document(
        self,
        document_id: int,
        to_status: DocumentStatus | str,
        detail: dict[str, Any] | None = None,
    ) -> Document:
        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.execute("SELECT status FROM documents WHERE id = %s FOR UPDATE", (document_id,))
            row = cur.fetchone()
            if row is None:
                raise RepositoryError(f"unknown document {document_id}")
            entry = transition(document_id, row["status"], to_status, detail)  # validates
            cur.execute(
                "UPDATE documents SET status = %s WHERE id = %s",
                (entry.to_state, document_id),
            )
            cur.execute(
                "INSERT INTO audit_log (entity, entity_id, from_state, to_state, detail) "
                "VALUES ('document', %s, %s, %s, %s)",
                (document_id, entry.from_state, entry.to_state, Jsonb(entry.detail)),
            )
            cur.execute(f"SELECT {_DOC_COLS} FROM documents WHERE id = %s", (document_id,))
            return _document(cur.fetchone())

    def set_document_progress(self, document_id: int, progress: dict[str, Any]) -> Document:
        with self.conn.cursor() as cur:
            cur.execute(
                f"UPDATE documents SET progress = progress || %s WHERE id = %s RETURNING {_DOC_COLS}",
                (Jsonb(progress), document_id),
            )
            row = cur.fetchone()
            if row is None:
                raise RepositoryError(f"unknown document {document_id}")
            return _document(row)

    def set_document_extraction_engine(self, document_id: int, engine: str) -> Document:
        with self.conn.cursor() as cur:
            cur.execute(
                f"UPDATE documents SET extraction_engine = %s WHERE id = %s RETURNING {_DOC_COLS}",
                (engine, document_id),
            )
            row = cur.fetchone()
            if row is None:
                raise RepositoryError(f"unknown document {document_id}")
            return _document(row)

    # --- line items --------------------------------------------------------
    def add_line_items(self, items: list[LineItem]) -> list[LineItem]:
        stored: list[LineItem] = []
        with self.conn.transaction(), self.conn.cursor() as cur:
            for item in items:
                cur.execute(
                    "INSERT INTO line_items (document_id, chunk_id, page_ref, sheet_ref, row_ref, "
                    "txn_date, raw_text, normalized_text, direction, normalized_amount, flags, "
                    "category_code, taxonomy_version, category_source, confidence, needs_review) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (
                        item.document_id, item.chunk_id, item.page_ref, item.sheet_ref, item.row_ref,
                        item.txn_date, item.raw_text, item.normalized_text, item.direction, item.amount,
                        Jsonb(item.flags), item.category_code, item.taxonomy_version,
                        item.category_source, item.confidence, item.needs_review,
                    ),
                )
                new_id = cur.fetchone()["id"]
                stored.append(LineItem(**{**item.__dict__, "id": new_id}))
        return stored

    def get_line_items(self, document_id: int) -> list[LineItem]:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT id, document_id, chunk_id, page_ref, sheet_ref, row_ref, txn_date, raw_text, "
                "normalized_text, direction, normalized_amount, flags, category_code, taxonomy_version, "
                "category_source, confidence, needs_review FROM line_items WHERE document_id = %s ORDER BY id",
                (document_id,),
            )
            return [
                LineItem(
                    id=r["id"], document_id=r["document_id"], chunk_id=r["chunk_id"],
                    page_ref=r["page_ref"], sheet_ref=r["sheet_ref"], row_ref=r["row_ref"],
                    txn_date=r["txn_date"], raw_text=r["raw_text"], normalized_text=r["normalized_text"],
                    direction=r["direction"], amount=float(r["normalized_amount"]), flags=r["flags"] or [],
                    category_code=r["category_code"], taxonomy_version=r["taxonomy_version"],
                    category_source=r["category_source"],
                    confidence=float(r["confidence"]) if r["confidence"] is not None else None,
                    needs_review=r["needs_review"],
                )
                for r in cur.fetchall()
            ]

    def set_line_item_category(
        self,
        line_item_id: int,
        *,
        category_code: str,
        category_source: str | None,
        confidence: float | None,
        taxonomy_version: str | None,
        needs_review: bool,
    ) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE line_items SET category_code = %s, category_source = %s, confidence = %s, "
                "taxonomy_version = %s, needs_review = %s WHERE id = %s",
                (category_code, category_source, confidence, taxonomy_version, needs_review, line_item_id),
            )

    def add_categorization_event(
        self,
        *,
        line_item_id: int,
        normalized_text: str,
        rung: int,
        candidates: list[dict[str, Any]],
        threshold: float | None,
        accepted: bool,
        chosen_code: str | None,
        taxonomy_version: str,
    ) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO categorization_events (line_item_id, normalized_text, rung, candidates, "
                "threshold, accepted, chosen_code, taxonomy_version) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (line_item_id, normalized_text, rung, Jsonb(candidates), threshold, accepted,
                 chosen_code, taxonomy_version),
            )

    def categorization_events(self, line_item_id: int) -> list[dict[str, Any]]:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT line_item_id, normalized_text, rung, candidates, threshold, accepted, "
                "chosen_code, taxonomy_version FROM categorization_events WHERE line_item_id = %s "
                "ORDER BY id",
                (line_item_id,),
            )
            return [dict(r) for r in cur.fetchall()]

    def all_categorization_events(self, limit: int = 5000) -> list[dict[str, Any]]:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT line_item_id, normalized_text, rung, accepted, chosen_code "
                "FROM categorization_events ORDER BY id DESC LIMIT %s",
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]

    def add_correction(
        self,
        *,
        line_item_id: int | None,
        field_changed: str,
        old_value: str | None,
        new_value: str | None,
        normalized_text: str | None,
    ) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO corrections (line_item_id, field_changed, old_value, new_value, "
                "normalized_text) VALUES (%s, %s, %s, %s, %s)",
                (line_item_id, field_changed, old_value, new_value, normalized_text),
            )

    def get_corrections(self, line_item_id: int) -> list[dict[str, Any]]:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT line_item_id, field_changed, old_value, new_value, normalized_text "
                "FROM corrections WHERE line_item_id = %s ORDER BY id",
                (line_item_id,),
            )
            return [dict(r) for r in cur.fetchall()]

    # --- audit -------------------------------------------------------------
    def append_audit(self, entry: AuditEntry) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO audit_log (entity, entity_id, from_state, to_state, detail) "
                "VALUES (%s, %s, %s, %s, %s)",
                (entry.entity, entry.entity_id, entry.from_state, entry.to_state, Jsonb(entry.detail)),
            )

    def audit_trail(self, entity: str, entity_id: int) -> list[AuditEntry]:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT entity, entity_id, from_state, to_state, detail FROM audit_log "
                "WHERE entity = %s AND entity_id = %s ORDER BY id",
                (entity, entity_id),
            )
            return [
                AuditEntry(r["entity"], r["entity_id"], r["from_state"], r["to_state"], r["detail"] or {})
                for r in cur.fetchall()
            ]

    # --- generated files ---------------------------------------------------
    def record_generated_file(
        self,
        engagement_id: int | None,
        template: str,
        compiler_version: str,
        validation_status: str,
        sha256: str | None = None,
        recompute_engine: str | None = None,
        taxonomy_version: str | None = None,
        tax_config_version: str | None = None,
        contract_schema_version: str | None = None,
    ) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO generated_files (engagement_id, template, compiler_version, "
                "contract_schema_version, taxonomy_version, tax_config_version, recompute_engine, "
                "validation_status, sha256) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                (engagement_id, template, compiler_version, contract_schema_version, taxonomy_version,
                 tax_config_version, recompute_engine, validation_status, sha256),
            )
            return cur.fetchone()["id"]


def apply_schema(conn: psycopg.Connection, sql_path: str | None = None) -> None:
    """Apply the idempotent ``db/schema.sql`` (CREATE … IF NOT EXISTS). The
    frontend uses ``apply-schema.ts`` for the same reason: ``drizzle-kit push``
    hangs, and Procrastinate owns its own tables via its CLI."""
    from pathlib import Path

    path = Path(sql_path) if sql_path else Path(__file__).parent / "schema.sql"
    with conn.cursor() as cur:
        cur.execute(path.read_text(encoding="utf-8"))

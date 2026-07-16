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

from litchai.db.repo import Document, Engagement, LineItem, RepositoryError
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


class PostgresRepository:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

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

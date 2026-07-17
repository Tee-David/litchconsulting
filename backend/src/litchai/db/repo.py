"""Data-access seam (Phase 2a).

The API, worker and categorization ladder depend on the :class:`Repository`
*protocol*, never on a live Postgres — exactly how the queue depends on
procrastinate's connector rather than a real broker. Two implementations:

* :class:`litchai.db.memory.InMemoryRepository` — dicts + Python-side trigram
  and cosine, used by the test suite (no Postgres needed locally).
* :class:`litchai.db.pg.PostgresRepository` — psycopg over the VM's Postgres +
  pgvector + pg_trgm, the production seam.

Both are validated by the same behavioural tests; the pg impl additionally runs
on the VM against real Postgres (recorded in the checklist).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Protocol

from litchai.documents.state import AuditEntry, DocumentStatus


class RepositoryError(RuntimeError):
    pass


@dataclass(frozen=True)
class Engagement:
    id: int
    client_id: str
    period_label: str
    template: str
    aux_inputs: dict[str, Any] | None
    materiality: float | None
    status: str
    created_at: datetime


@dataclass(frozen=True)
class GeneratedFile:
    """A compiled deliverable. ``sha256`` content-addresses the workbook bytes
    in ``Storage.read_artifact`` — there is no path column."""

    id: int
    engagement_id: int | None
    template: str
    compiler_version: str
    validation_status: str
    hitl_status: str
    sha256: str | None
    created_at: datetime


@dataclass(frozen=True)
class Document:
    id: int
    engagement_id: int | None
    client_id: str
    filename: str
    mime: str
    source_hash: str
    byte_size: int | None
    status: str
    progress: dict[str, Any]
    extraction_engine: str | None
    account_label: str | None
    period_start: date | None
    period_end: date | None
    created_at: datetime


@dataclass(frozen=True)
class LineItem:
    """A normalized, categorized (or awaiting-categorization) statement line.

    Mirrors the ``line_items`` table; ``amount`` is always non-negative and
    ``direction`` carries the sign, matching :class:`litchai.mapping.LineItemRow`.
    """

    id: int
    document_id: int
    raw_text: str
    normalized_text: str
    direction: str | None
    amount: float
    page_ref: int | None = None
    sheet_ref: str | None = None
    row_ref: int | None = None
    txn_date: date | None = None
    chunk_id: int | None = None
    flags: list[str] = field(default_factory=list)
    category_code: str | None = None
    taxonomy_version: str | None = None
    category_source: str | None = None
    confidence: float | None = None
    needs_review: bool = False


@dataclass(frozen=True)
class KnowledgeChunk:
    """A retrievable chunk in the Copilot RAG store (Milestone 8).

    ``scope='firm'`` rows are firm-global (``client_id`` is ``None``); ``scope=
    'client'`` rows carry per-client operational context and are only ever
    returned under a hard ``client_id`` filter. ``content_hash`` is the upsert
    key, so reindexing is idempotent. ``id`` is ``None`` before persistence.
    """

    source_type: str
    source_id: str
    title: str
    text: str
    content_hash: str
    section: str | None = None
    tokens: int = 0
    scope: str = "firm"
    client_id: str | None = None
    embedding: list[float] | None = None
    id: int | None = None
    updated_at: datetime | None = None


class Repository(Protocol):
    """Everything the pipeline persists. Grown per phase; Phase 2a covers
    engagements, documents, the state machine and generated files."""

    # --- knowledge chunks (Copilot RAG store, Milestone 8) -----------------
    def upsert_knowledge_chunk(self, chunk: KnowledgeChunk) -> KnowledgeChunk:
        """Insert or (on ``content_hash`` conflict) refresh a chunk. Idempotent —
        the reindex CLI relies on this to never duplicate an unchanged chunk."""
        ...

    def get_knowledge_chunk(self, chunk_id: int) -> KnowledgeChunk | None: ...

    def list_knowledge_chunks(
        self, *, source_type: str | None = None, scope: str | None = None, limit: int = 1000
    ) -> list[KnowledgeChunk]: ...

    def knowledge_trigram(
        self, query: str, client_id: str | None, min_sim: float, limit: int = 20
    ) -> list[tuple[KnowledgeChunk, float]]:
        """pg_trgm similarity over ``text``. Scope filter: firm-global rows are
        always visible; client rows only when ``client_id`` matches (hard filter,
        so one client can never see another's operational context)."""
        ...

    def knowledge_vector(
        self, embedding: list[float], client_id: str | None, min_cos: float, limit: int = 20
    ) -> list[tuple[KnowledgeChunk, float]]:
        """pgvector cosine over ``embedding``, same scope filter as
        :meth:`knowledge_trigram`."""
        ...

    def knowledge_section(self, source_id: str, section: str | None) -> list[KnowledgeChunk]:
        """All sibling chunks of a section (parent-section return for citations)."""
        ...

    def delete_knowledge(
        self, *, source_type: str | None = None, scope: str | None = None, client_id: str | None = None
    ) -> int:
        """Drop a slice of the store (e.g. all firm chunks before a full reindex,
        or one client's operational context on erasure). Returns rows deleted."""
        ...

    # --- engagements -------------------------------------------------------
    def create_engagement(
        self,
        client_id: str,
        period_label: str,
        template: str,
        aux_inputs: dict[str, Any] | None = None,
        materiality: float | None = None,
    ) -> Engagement: ...

    def get_engagement(self, engagement_id: int) -> Engagement | None: ...

    def transition_engagement(
        self,
        engagement_id: int,
        to_status: str,
        detail: dict[str, Any] | None = None,
    ) -> Engagement:
        """Advance ``engagements.status`` through the engagement state machine and
        append the matching ``audit_log`` row. Raises
        :class:`~litchai.documents.state.IllegalTransition` on an illegal move."""
        ...

    def set_generated_file_hitl_status(self, generated_file_id: int, hitl_status: str) -> None: ...

    def latest_generated_file(self, engagement_id: int) -> GeneratedFile | None:
        """Most recent compiled deliverable for the engagement, or None."""
        ...

    def mark_engagement_deliverable(self, engagement_id: int) -> int:
        """Set every generated file of the engagement to ``hitl_status='approved'``
        (the deliverable mark). Returns the number of files updated."""
        ...

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
    ) -> Document: ...

    def get_document(self, document_id: int) -> Document | None: ...

    def find_document_by_hash(self, client_id: str, source_hash: str) -> Document | None: ...

    def list_documents(self, client_id: str | None = None, limit: int = 100) -> list[Document]: ...

    def delete_client_data(self, client_id: str) -> dict[str, int]:
        """NDPA erasure: delete a client's documents (cascading line_items,
        events, corrections), engagements and generated files. Returns per-entity
        counts. Category memory is erased separately via the store."""
        ...

    def transition_document(
        self,
        document_id: int,
        to_status: DocumentStatus | str,
        detail: dict[str, Any] | None = None,
    ) -> Document:
        """Advance ``documents.status`` through the state machine and append the
        matching ``audit_log`` row atomically. Raises
        :class:`litchai.documents.state.IllegalTransition` on an illegal move."""
        ...

    def set_document_progress(self, document_id: int, progress: dict[str, Any]) -> Document: ...

    def set_document_extraction_engine(self, document_id: int, engine: str) -> Document: ...

    # --- line items --------------------------------------------------------
    def add_line_items(self, items: list[LineItem]) -> list[LineItem]: ...

    def get_line_items(self, document_id: int) -> list[LineItem]: ...

    def set_line_item_category(
        self,
        line_item_id: int,
        *,
        category_code: str,
        category_source: str | None,
        confidence: float | None,
        taxonomy_version: str | None,
        needs_review: bool,
    ) -> None: ...

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
    ) -> None: ...

    def categorization_events(self, line_item_id: int) -> list[dict[str, Any]]: ...

    def all_categorization_events(self, limit: int = 5000) -> list[dict[str, Any]]: ...

    # --- corrections (HITL audit trail; retrieval copy is dual-written) -----
    def add_correction(
        self,
        *,
        line_item_id: int | None,
        field_changed: str,
        old_value: str | None,
        new_value: str | None,
        normalized_text: str | None,
    ) -> None: ...

    def get_corrections(self, line_item_id: int) -> list[dict[str, Any]]: ...

    # --- audit -------------------------------------------------------------
    def append_audit(self, entry: AuditEntry) -> None: ...

    def audit_trail(self, entity: str, entity_id: int) -> list[AuditEntry]: ...

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
    ) -> int: ...

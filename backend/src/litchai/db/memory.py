"""In-memory :class:`Repository` for the test suite — no Postgres required.

Faithful to the pg impl's *behaviour* (id assignment, state-machine enforcement,
hash dedup, audit append), so the same behavioural tests cover both. The
similarity helpers (trigram / cosine) live here too, standing in for pg_trgm and
pgvector; see :mod:`litchai.categorize.memory_store`.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from litchai.db.repo import Document, Engagement, LineItem, RepositoryError
from litchai.documents.state import AuditEntry, DocumentStatus, transition


def _now() -> datetime:
    return datetime.now(timezone.utc)


class InMemoryRepository:
    def __init__(self) -> None:
        self._engagements: dict[int, Engagement] = {}
        self._documents: dict[int, Document] = {}
        self._line_items: dict[int, LineItem] = {}
        self._events: list[dict[str, Any]] = []
        self._corrections: list[dict[str, Any]] = []
        self._audit: list[AuditEntry] = []
        self._generated: dict[int, dict[str, Any]] = {}
        self._seq = 0

    def _next_id(self) -> int:
        self._seq += 1
        return self._seq

    # --- engagements -------------------------------------------------------
    def create_engagement(
        self,
        client_id: str,
        period_label: str,
        template: str,
        aux_inputs: dict[str, Any] | None = None,
        materiality: float | None = None,
    ) -> Engagement:
        eng = Engagement(
            id=self._next_id(),
            client_id=client_id,
            period_label=period_label,
            template=template,
            aux_inputs=aux_inputs,
            materiality=materiality,
            status="open",
            created_at=_now(),
        )
        self._engagements[eng.id] = eng
        return eng

    def get_engagement(self, engagement_id: int) -> Engagement | None:
        return self._engagements.get(engagement_id)

    def transition_engagement(
        self, engagement_id: int, to_status: str, detail: dict[str, Any] | None = None
    ) -> Engagement:
        from litchai.documents.engagement_state import transition as eng_transition

        eng = self._engagements.get(engagement_id)
        if eng is None:
            raise RepositoryError(f"unknown engagement {engagement_id}")
        entry = eng_transition(engagement_id, eng.status, to_status, detail)  # raises on illegal move
        self._audit.append(entry)
        updated = Engagement(**{**eng.__dict__, "status": entry.to_state})
        self._engagements[engagement_id] = updated
        return updated

    def set_generated_file_hitl_status(self, generated_file_id: int, hitl_status: str) -> None:
        gen = self._generated.get(generated_file_id)
        if gen is None:
            raise RepositoryError(f"unknown generated file {generated_file_id}")
        gen["hitl_status"] = hitl_status

    def mark_engagement_deliverable(self, engagement_id: int) -> int:
        n = 0
        for gen in self._generated.values():
            if gen.get("engagement_id") == engagement_id:
                gen["hitl_status"] = "approved"
                n += 1
        return n

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
        if engagement_id is not None and engagement_id not in self._engagements:
            raise RepositoryError(f"unknown engagement {engagement_id}")
        doc = Document(
            id=self._next_id(),
            engagement_id=engagement_id,
            client_id=client_id,
            filename=filename,
            mime=mime,
            source_hash=source_hash,
            byte_size=byte_size,
            status=DocumentStatus.RECEIVED.value,
            progress={},
            extraction_engine=None,
            account_label=account_label,
            period_start=None,
            period_end=None,
            created_at=_now(),
        )
        self._documents[doc.id] = doc
        self._audit.append(
            AuditEntry("document", doc.id, None, DocumentStatus.RECEIVED.value, {"filename": filename})
        )
        return doc

    def get_document(self, document_id: int) -> Document | None:
        return self._documents.get(document_id)

    def find_document_by_hash(self, client_id: str, source_hash: str) -> Document | None:
        for doc in self._documents.values():
            if doc.client_id == client_id and doc.source_hash == source_hash:
                return doc
        return None

    def list_documents(self, client_id: str | None = None, limit: int = 100) -> list[Document]:
        docs = [
            d for d in self._documents.values()
            if client_id is None or d.client_id == client_id
        ]
        docs.sort(key=lambda d: d.id, reverse=True)
        return docs[:limit]

    def delete_client_data(self, client_id: str) -> dict[str, int]:
        doc_ids = {d.id for d in self._documents.values() if d.client_id == client_id}
        line_ids = {li.id for li in self._line_items.values() if li.document_id in doc_ids}
        eng_ids = {e.id for e in self._engagements.values() if e.client_id == client_id}
        counts = {"documents": len(doc_ids), "line_items": len(line_ids), "engagements": len(eng_ids)}
        self._documents = {i: d for i, d in self._documents.items() if i not in doc_ids}
        self._line_items = {i: li for i, li in self._line_items.items() if li.id not in line_ids}
        self._events = [e for e in self._events if e["line_item_id"] not in line_ids]
        self._corrections = [c for c in self._corrections if c["line_item_id"] not in line_ids]
        self._engagements = {i: e for i, e in self._engagements.items() if i not in eng_ids}
        self._generated = {i: g for i, g in self._generated.items() if g.get("engagement_id") not in eng_ids}
        return counts

    def _replace_document(self, doc: Document, **changes: Any) -> Document:
        updated = Document(**{**doc.__dict__, **changes})
        self._documents[doc.id] = updated
        return updated

    def transition_document(
        self,
        document_id: int,
        to_status: DocumentStatus | str,
        detail: dict[str, Any] | None = None,
    ) -> Document:
        doc = self._documents.get(document_id)
        if doc is None:
            raise RepositoryError(f"unknown document {document_id}")
        entry = transition(document_id, doc.status, to_status, detail)  # raises on illegal move
        self._audit.append(entry)
        return self._replace_document(doc, status=entry.to_state)

    def set_document_progress(self, document_id: int, progress: dict[str, Any]) -> Document:
        doc = self._documents.get(document_id)
        if doc is None:
            raise RepositoryError(f"unknown document {document_id}")
        return self._replace_document(doc, progress={**doc.progress, **progress})

    def set_document_extraction_engine(self, document_id: int, engine: str) -> Document:
        doc = self._documents.get(document_id)
        if doc is None:
            raise RepositoryError(f"unknown document {document_id}")
        return self._replace_document(doc, extraction_engine=engine)

    # --- line items --------------------------------------------------------
    def add_line_items(self, items: list[LineItem]) -> list[LineItem]:
        stored: list[LineItem] = []
        for item in items:
            new = LineItem(**{**item.__dict__, "id": self._next_id()})
            self._line_items[new.id] = new
            stored.append(new)
        return stored

    def get_line_items(self, document_id: int) -> list[LineItem]:
        return [li for li in self._line_items.values() if li.document_id == document_id]

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
        item = self._line_items.get(line_item_id)
        if item is None:
            raise RepositoryError(f"unknown line item {line_item_id}")
        self._line_items[line_item_id] = LineItem(
            **{
                **item.__dict__,
                "category_code": category_code,
                "category_source": category_source,
                "confidence": confidence,
                "taxonomy_version": taxonomy_version,
                "needs_review": needs_review,
            }
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
        self._events.append(
            {
                "line_item_id": line_item_id, "normalized_text": normalized_text, "rung": rung,
                "candidates": candidates, "threshold": threshold, "accepted": accepted,
                "chosen_code": chosen_code, "taxonomy_version": taxonomy_version,
            }
        )

    def categorization_events(self, line_item_id: int) -> list[dict[str, Any]]:
        return [e for e in self._events if e["line_item_id"] == line_item_id]

    def all_categorization_events(self, limit: int = 5000) -> list[dict[str, Any]]:
        return self._events[-limit:]

    def add_correction(
        self,
        *,
        line_item_id: int | None,
        field_changed: str,
        old_value: str | None,
        new_value: str | None,
        normalized_text: str | None,
    ) -> None:
        self._corrections.append(
            {
                "line_item_id": line_item_id, "field_changed": field_changed,
                "old_value": old_value, "new_value": new_value, "normalized_text": normalized_text,
            }
        )

    def get_corrections(self, line_item_id: int) -> list[dict[str, Any]]:
        return [c for c in self._corrections if c["line_item_id"] == line_item_id]

    # --- audit -------------------------------------------------------------
    def append_audit(self, entry: AuditEntry) -> None:
        self._audit.append(entry)

    def audit_trail(self, entity: str, entity_id: int) -> list[AuditEntry]:
        return [e for e in self._audit if e.entity == entity and e.entity_id == entity_id]

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
        gid = self._next_id()
        self._generated[gid] = {
            "engagement_id": engagement_id,
            "template": template,
            "compiler_version": compiler_version,
            "validation_status": validation_status,
            "sha256": sha256,
            "recompute_engine": recompute_engine,
            "taxonomy_version": taxonomy_version,
            "tax_config_version": tax_config_version,
            "contract_schema_version": contract_schema_version,
            "hitl_status": "draft",
            "created_at": _now(),
        }
        return gid

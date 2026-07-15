"""Document lifecycle state machine (Phase 2a, checklist).

Every ``documents.status`` change goes through :func:`transition` — there are no
bare column updates anywhere in the pipeline. An illegal move raises
:class:`IllegalTransition`; a legal one returns an :class:`AuditEntry` the caller
persists to ``audit_log`` in the *same* transaction as the column write, so the
audit trail (FR9) can never drift from the status column.

The status set is the ingestion lifecycle of a single document:

    received ─▶ scanning ─▶ extracting ─▶ extracted ─▶ categorizing ─▶ categorized
       │           │            │                                          │
       └▶ superseded│            └▶ extraction_failed ⇄ extracting          └▶ superseded
                    └▶ rejected  (rejected on repeated failure)

``rejected`` and ``superseded`` are terminal. A re-uploaded/overlapping
statement supersedes the old document rather than mutating it (dedup, Phase 2b).
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class DocumentStatus(str, Enum):
    RECEIVED = "received"          # ciphertext stored on the VM (schema default)
    SCANNING = "scanning"         # ClamAV + format check inside the Docker sandbox
    REJECTED = "rejected"         # failed malware/format/sandbox check (terminal)
    EXTRACTING = "extracting"     # Docling / Excel extraction running
    EXTRACTION_FAILED = "extraction_failed"  # retryable
    EXTRACTED = "extracted"       # line_items produced with provenance
    CATEGORIZING = "categorizing"  # ladder running over this doc's line items
    CATEGORIZED = "categorized"   # ready to feed the engagement compile / review
    SUPERSEDED = "superseded"     # replaced by a re-upload / overlap (terminal)


# Explicit allowed-transitions map. A status whose value set is empty is terminal.
ALLOWED_TRANSITIONS: dict[DocumentStatus, frozenset[DocumentStatus]] = {
    DocumentStatus.RECEIVED: frozenset(
        {DocumentStatus.SCANNING, DocumentStatus.REJECTED, DocumentStatus.SUPERSEDED}
    ),
    DocumentStatus.SCANNING: frozenset(
        {DocumentStatus.EXTRACTING, DocumentStatus.REJECTED}
    ),
    DocumentStatus.EXTRACTING: frozenset(
        {DocumentStatus.EXTRACTED, DocumentStatus.EXTRACTION_FAILED}
    ),
    DocumentStatus.EXTRACTION_FAILED: frozenset(
        {DocumentStatus.EXTRACTING, DocumentStatus.REJECTED}
    ),
    DocumentStatus.EXTRACTED: frozenset(
        {DocumentStatus.CATEGORIZING, DocumentStatus.SUPERSEDED}
    ),
    DocumentStatus.CATEGORIZING: frozenset(
        {DocumentStatus.CATEGORIZED, DocumentStatus.EXTRACTION_FAILED}
    ),
    DocumentStatus.CATEGORIZED: frozenset({DocumentStatus.SUPERSEDED}),
    DocumentStatus.REJECTED: frozenset(),
    DocumentStatus.SUPERSEDED: frozenset(),
}

TERMINAL: frozenset[DocumentStatus] = frozenset(
    status for status, nxt in ALLOWED_TRANSITIONS.items() if not nxt
)


class IllegalTransition(ValueError):
    """Raised on a status change not in :data:`ALLOWED_TRANSITIONS`."""


@dataclass(frozen=True)
class AuditEntry:
    """One append-only ``audit_log`` row; the caller persists it verbatim."""

    entity: str
    entity_id: int
    from_state: str | None
    to_state: str
    detail: dict[str, Any] = field(default_factory=dict)


def _coerce(status: DocumentStatus | str) -> DocumentStatus:
    return status if isinstance(status, DocumentStatus) else DocumentStatus(status)


def can_transition(src: DocumentStatus | str, dst: DocumentStatus | str) -> bool:
    return _coerce(dst) in ALLOWED_TRANSITIONS.get(_coerce(src), frozenset())


def transition(
    entity_id: int,
    src: DocumentStatus | str,
    dst: DocumentStatus | str,
    detail: dict[str, Any] | None = None,
    entity: str = "document",
) -> AuditEntry:
    """Validate a status move and return the audit row to persist.

    Raises :class:`IllegalTransition` if ``src → dst`` is not allowed, so a
    caller can never silently write an out-of-order status.
    """
    src_s, dst_s = _coerce(src), _coerce(dst)
    if dst_s not in ALLOWED_TRANSITIONS.get(src_s, frozenset()):
        raise IllegalTransition(f"{entity} {entity_id}: {src_s.value} → {dst_s.value} not allowed")
    return AuditEntry(
        entity=entity,
        entity_id=entity_id,
        from_state=src_s.value,
        to_state=dst_s.value,
        detail=detail or {},
    )


def engagement_lock_key(engagement_id: int) -> int:
    """Deterministic 63-bit key for ``pg_advisory_xact_lock`` so two workers
    never compile the same engagement concurrently (Phase 2a compile lock).

    ``bigint`` advisory locks are signed 64-bit; we mask to 63 bits to stay
    positive and stable across processes (``hash()`` is salted per-process)."""
    digest = hashlib.blake2b(f"engagement:{engagement_id}".encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big") & ((1 << 63) - 1)

"""Engagement lifecycle state machine (Phase 4).

An engagement is one client-period compiled from many documents. Its lifecycle
gates the HITL sign-off and the period lock:

    open ─▶ in_review ─▶ approved ─▶ locked
     ▲          │            │          │
     └──────────┘            └──────────┴─▶ reopened ─▶ in_review

* ``approved`` marks the compiled file a **deliverable**.
* ``locked`` freezes the line items (period lock) — corrections are refused.
* a late document ``reopens`` an approved/locked engagement explicitly, which
  produces a draft-vs-draft diff (:mod:`litchai.review.diff`).

Reuses the generic :class:`~litchai.documents.state.AuditEntry` /
:class:`IllegalTransition`, so engagement transitions land in the same
``audit_log`` as document transitions.
"""
from __future__ import annotations

from enum import Enum
from typing import Any

from litchai.documents.state import AuditEntry, IllegalTransition


class EngagementStatus(str, Enum):
    OPEN = "open"              # accepting/categorizing documents
    IN_REVIEW = "in_review"   # compiled; under HITL review
    APPROVED = "approved"     # reviewer signed off → deliverable
    LOCKED = "locked"         # period locked; line items frozen
    REOPENED = "reopened"     # a late document reopened it


ALLOWED_TRANSITIONS: dict[EngagementStatus, frozenset[EngagementStatus]] = {
    EngagementStatus.OPEN: frozenset({EngagementStatus.IN_REVIEW}),
    EngagementStatus.IN_REVIEW: frozenset({EngagementStatus.APPROVED, EngagementStatus.OPEN}),
    EngagementStatus.APPROVED: frozenset({EngagementStatus.LOCKED, EngagementStatus.REOPENED}),
    EngagementStatus.LOCKED: frozenset({EngagementStatus.REOPENED}),
    EngagementStatus.REOPENED: frozenset({EngagementStatus.IN_REVIEW}),
}

# Statuses in which the period is locked and corrections must be refused.
FROZEN: frozenset[EngagementStatus] = frozenset({EngagementStatus.APPROVED, EngagementStatus.LOCKED})


def _coerce(status: EngagementStatus | str) -> EngagementStatus:
    return status if isinstance(status, EngagementStatus) else EngagementStatus(status)


def can_transition(src: EngagementStatus | str, dst: EngagementStatus | str) -> bool:
    return _coerce(dst) in ALLOWED_TRANSITIONS.get(_coerce(src), frozenset())


def is_frozen(status: EngagementStatus | str) -> bool:
    return _coerce(status) in FROZEN


def transition(
    engagement_id: int,
    src: EngagementStatus | str,
    dst: EngagementStatus | str,
    detail: dict[str, Any] | None = None,
) -> AuditEntry:
    src_s, dst_s = _coerce(src), _coerce(dst)
    if dst_s not in ALLOWED_TRANSITIONS.get(src_s, frozenset()):
        raise IllegalTransition(f"engagement {engagement_id}: {src_s.value} → {dst_s.value} not allowed")
    return AuditEntry(
        entity="engagement",
        entity_id=engagement_id,
        from_state=src_s.value,
        to_state=dst_s.value,
        detail=detail or {},
    )

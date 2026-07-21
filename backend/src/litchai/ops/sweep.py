"""Stale-document sweeper (self-heal for stuck ingestion).

A document sits in an *in-flight* status (``received``/``scanning``/
``extracting``/``categorizing``) only while its ``litchai.ingest_document`` job
is running. If the worker dies mid-job — OOM, ``kill -9``, a native crash or hang
inside an extraction engine, or any failure the job's own ``try/except`` can't
record because the process is gone — the row is stranded there forever: the
Procrastinate job never re-runs, and the UI shows "Extracting…" indefinitely with
no reason and no retry path.

This module finds those orphans (an in-flight document, older than a grace
window, with no live queue job) and lands them in the state machine's own
retryable/terminal failure status so the failure becomes *visible* and the
"Reanalyze" button becomes reachable. The decision logic is pure and injectable
so the test suite can exercise it against :class:`InMemoryRepository` with no
Postgres or queue.
"""
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from litchai.db.repo import Repository
from litchai.documents.state import DocumentStatus, can_transition

# Statuses a document only holds *while a job is actively working it*.
IN_FLIGHT: frozenset[DocumentStatus] = frozenset(
    {
        DocumentStatus.RECEIVED,
        DocumentStatus.SCANNING,
        DocumentStatus.EXTRACTING,
        DocumentStatus.CATEGORIZING,
    }
)

# Where a stalled in-flight status should land. Every mapping below is a legal
# edge in ALLOWED_TRANSITIONS (asserted at import via _validate); we keep it
# explicit rather than "pick any allowed failure" so the intent is auditable.
FAILURE_TARGET: dict[DocumentStatus, DocumentStatus] = {
    DocumentStatus.RECEIVED: DocumentStatus.REJECTED,
    DocumentStatus.SCANNING: DocumentStatus.REJECTED,
    DocumentStatus.EXTRACTING: DocumentStatus.EXTRACTION_FAILED,
    DocumentStatus.CATEGORIZING: DocumentStatus.EXTRACTION_FAILED,
}

DEFAULT_STALE_AFTER = timedelta(minutes=30)


def _validate() -> None:
    for src, dst in FAILURE_TARGET.items():
        if not can_transition(src, dst):
            raise AssertionError(f"sweep: {src.value} → {dst.value} is not a legal transition")


_validate()


def failure_target(status: DocumentStatus | str) -> DocumentStatus | None:
    """The legal failure status a stalled in-flight ``status`` should move to,
    or ``None`` if ``status`` isn't an in-flight status we sweep."""
    try:
        current = status if isinstance(status, DocumentStatus) else DocumentStatus(status)
    except ValueError:
        return None
    return FAILURE_TARGET.get(current)


def fail_in_flight(repo: Repository, document_id: int, reason: str) -> bool:
    """Best-effort: move a document out of its in-flight status into the matching
    failure status, recording ``reason`` in progress. Used by the ingest job to
    record an *uncaught* error before the job dies, so the document never freezes
    at an in-flight status. Returns whether a transition happened; never raises —
    the caller is already handling an error and the DB may itself be the failure.
    """
    try:
        doc = repo.get_document(document_id)
        if doc is None:
            return False
        target = failure_target(doc.status)
        if target is None:
            return False
        repo.set_document_progress(document_id, {"stage": target.value, "reason": reason})
        repo.transition_document(document_id, target, {"reason": reason})
        return True
    except Exception:
        return False


def sweep_stale_documents(
    repo: Repository,
    *,
    has_active_job: Callable[[int], bool],
    last_activity_at: Callable[..., datetime],
    now: datetime | None = None,
    stale_after: timedelta = DEFAULT_STALE_AFTER,
    reason: str = "stalled — worker died mid-job",
) -> list[int]:
    """Fail every orphaned in-flight document and return the swept ids.

    A document is swept when it is in an in-flight status, its last activity is
    older than ``stale_after``, and it has no live (``todo``/``doing``) queue
    job. The two seams keep this pure: ``has_active_job(document_id)`` answers
    the queue question and ``last_activity_at(document)`` gives the timestamp of
    the row's most recent state transition (the production wiring reads the
    latest ``audit_log`` row, falling back to ``created_at``).
    """
    moment = now or datetime.now(timezone.utc)
    cutoff = moment - stale_after
    swept: list[int] = []

    for doc in repo.list_documents(limit=10_000):
        target = failure_target(doc.status)
        if target is None:
            continue
        if last_activity_at(doc) > cutoff:
            continue
        if has_active_job(doc.id):
            continue
        repo.set_document_progress(
            doc.id, {"stage": target.value, "reason": reason}
        )
        repo.transition_document(doc.id, target, {"reason": reason})
        swept.append(doc.id)

    return swept

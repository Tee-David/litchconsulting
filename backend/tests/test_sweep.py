"""Stale-document self-heal: the ingest job's catch-all + the periodic sweeper."""
from datetime import datetime, timedelta, timezone

from litchai.db import InMemoryRepository
from litchai.documents.state import DocumentStatus
from litchai.ops.sweep import (
    FAILURE_TARGET,
    fail_in_flight,
    failure_target,
    sweep_stale_documents,
)

CLIENT = "11111111-1111-1111-1111-111111111111"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _extracting_doc(repo, *, source_hash="h1"):
    """A document parked at ``extracting`` (the state a crashed ingest job leaves)."""
    doc = repo.create_document(CLIENT, "s.xlsx", XLSX_MIME, source_hash, 100)
    repo.transition_document(doc.id, DocumentStatus.SCANNING, {})
    repo.transition_document(doc.id, DocumentStatus.EXTRACTING, {})
    return repo.get_document(doc.id)


# --- failure_target mapping -------------------------------------------------

def test_failure_target_maps_every_in_flight_status_to_a_legal_edge():
    assert failure_target("extracting") == DocumentStatus.EXTRACTION_FAILED
    assert failure_target("categorizing") == DocumentStatus.EXTRACTION_FAILED
    assert failure_target("scanning") == DocumentStatus.REJECTED
    assert failure_target("received") == DocumentStatus.REJECTED


def test_failure_target_ignores_terminal_and_settled_statuses():
    for settled in ("extracted", "categorized", "rejected", "superseded", "extraction_failed"):
        assert failure_target(settled) is None
    assert failure_target("not-a-status") is None


def test_failure_targets_are_all_legal_transitions():
    from litchai.documents.state import can_transition

    for src, dst in FAILURE_TARGET.items():
        assert can_transition(src, dst)


# --- fail_in_flight (the ingest job's catch-all) ----------------------------

def test_fail_in_flight_records_reason_and_transitions():
    repo = InMemoryRepository()
    doc = _extracting_doc(repo)

    assert fail_in_flight(repo, doc.id, "PermissionError: [Errno 13] key") is True

    after = repo.get_document(doc.id)
    assert after.status == "extraction_failed"
    assert after.progress["reason"] == "PermissionError: [Errno 13] key"
    assert repo.audit_trail("document", doc.id)[-1].to_state == "extraction_failed"


def test_fail_in_flight_is_a_noop_on_a_settled_document():
    repo = InMemoryRepository()
    doc = _extracting_doc(repo)
    repo.transition_document(doc.id, DocumentStatus.EXTRACTED, {})

    assert fail_in_flight(repo, doc.id, "too late") is False
    assert repo.get_document(doc.id).status == "extracted"


def test_fail_in_flight_never_raises_on_unknown_document():
    repo = InMemoryRepository()
    assert fail_in_flight(repo, 9999, "gone") is False


# --- sweep_stale_documents (the periodic sweeper) ---------------------------

def test_sweeper_fails_a_stale_orphan():
    repo = InMemoryRepository()
    doc = _extracting_doc(repo)
    now = datetime.now(timezone.utc)

    swept = sweep_stale_documents(
        repo,
        has_active_job=lambda _id: False,
        last_activity_at=lambda _d: now - timedelta(hours=2),
        now=now,
    )

    assert swept == [doc.id]
    after = repo.get_document(doc.id)
    assert after.status == "extraction_failed"
    assert "stalled" in after.progress["reason"]


def test_sweeper_leaves_a_fresh_document_alone():
    repo = InMemoryRepository()
    doc = _extracting_doc(repo)
    now = datetime.now(timezone.utc)

    swept = sweep_stale_documents(
        repo,
        has_active_job=lambda _id: False,
        last_activity_at=lambda _d: now - timedelta(minutes=1),  # inside grace window
        now=now,
    )

    assert swept == []
    assert repo.get_document(doc.id).status == "extracting"


def test_sweeper_leaves_a_doc_with_a_live_job_alone():
    repo = InMemoryRepository()
    doc = _extracting_doc(repo)
    now = datetime.now(timezone.utc)

    swept = sweep_stale_documents(
        repo,
        has_active_job=lambda _id: True,  # a worker is still on it
        last_activity_at=lambda _d: now - timedelta(hours=2),
        now=now,
    )

    assert swept == []
    assert repo.get_document(doc.id).status == "extracting"


def test_sweeper_ignores_settled_documents():
    repo = InMemoryRepository()
    doc = _extracting_doc(repo)
    repo.transition_document(doc.id, DocumentStatus.EXTRACTED, {})
    now = datetime.now(timezone.utc)

    swept = sweep_stale_documents(
        repo,
        has_active_job=lambda _id: False,
        last_activity_at=lambda _d: now - timedelta(days=1),
        now=now,
    )

    assert swept == []
    assert repo.get_document(doc.id).status == "extracted"


def test_sweeper_maps_scanning_to_rejected():
    repo = InMemoryRepository()
    doc = repo.create_document(CLIENT, "s.xlsx", XLSX_MIME, "h2", 100)
    repo.transition_document(doc.id, DocumentStatus.SCANNING, {})
    now = datetime.now(timezone.utc)

    swept = sweep_stale_documents(
        repo,
        has_active_job=lambda _id: False,
        last_activity_at=lambda _d: now - timedelta(hours=1),
        now=now,
    )

    assert swept == [doc.id]
    assert repo.get_document(doc.id).status == "rejected"

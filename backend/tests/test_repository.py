"""Repository behavioural tests against the in-memory impl (Phase 2a).

The pg impl mirrors this behaviour and is exercised on the VM against real
Postgres; these lock the contract both must satisfy.
"""
import pytest

from litchai.db import InMemoryRepository, LineItem, RepositoryError
from litchai.documents.state import DocumentStatus, IllegalTransition

CLIENT = "11111111-1111-1111-1111-111111111111"


def _doc(repo, **kw):
    return repo.create_document(
        client_id=kw.get("client_id", CLIENT),
        filename=kw.get("filename", "gtbank-jan.pdf"),
        mime=kw.get("mime", "application/pdf"),
        source_hash=kw.get("source_hash", "abc123"),
        byte_size=kw.get("byte_size", 4096),
        engagement_id=kw.get("engagement_id"),
    )


def test_create_document_defaults_to_received_and_audits():
    repo = InMemoryRepository()
    doc = _doc(repo)
    assert doc.status == DocumentStatus.RECEIVED.value
    trail = repo.audit_trail("document", doc.id)
    assert len(trail) == 1
    assert trail[0].from_state is None and trail[0].to_state == "received"


def test_transition_advances_status_and_appends_audit():
    repo = InMemoryRepository()
    doc = _doc(repo)
    repo.transition_document(doc.id, DocumentStatus.SCANNING, {"scanner": "clamav"})
    updated = repo.transition_document(doc.id, DocumentStatus.EXTRACTING)
    assert updated.status == "extracting"
    trail = repo.audit_trail("document", doc.id)
    assert [e.to_state for e in trail] == ["received", "scanning", "extracting"]
    assert trail[1].detail == {"scanner": "clamav"}


def test_illegal_transition_rejected_by_repo():
    repo = InMemoryRepository()
    doc = _doc(repo)
    with pytest.raises(IllegalTransition):
        repo.transition_document(doc.id, DocumentStatus.CATEGORIZED)


def test_find_document_by_hash_scopes_to_client():
    repo = InMemoryRepository()
    _doc(repo, source_hash="deadbeef")
    assert repo.find_document_by_hash(CLIENT, "deadbeef") is not None
    assert repo.find_document_by_hash(CLIENT, "nope") is None
    other = "22222222-2222-2222-2222-222222222222"
    assert repo.find_document_by_hash(other, "deadbeef") is None


def test_progress_merges():
    repo = InMemoryRepository()
    doc = _doc(repo)
    repo.set_document_progress(doc.id, {"stage": "scan", "pct": 10})
    merged = repo.set_document_progress(doc.id, {"pct": 55})
    assert merged.progress == {"stage": "scan", "pct": 55}


def test_engagement_link_validated():
    repo = InMemoryRepository()
    eng = repo.create_engagement(CLIENT, "FY2025", "annual_report_ias1")
    doc = _doc(repo, engagement_id=eng.id)
    assert doc.engagement_id == eng.id
    with pytest.raises(RepositoryError):
        _doc(repo, engagement_id=999)


def test_line_items_roundtrip_and_ids_assigned():
    repo = InMemoryRepository()
    doc = _doc(repo)
    items = [
        LineItem(id=0, document_id=doc.id, raw_text="POS PAYSTACK", normalized_text="pos paystack",
                 direction="in", amount=1500.0, sheet_ref="Sheet1!A2", row_ref=2),
        LineItem(id=0, document_id=doc.id, raw_text="BANK CHARGES", normalized_text="bank charges",
                 direction="out", amount=52.5, sheet_ref="Sheet1!A3", row_ref=3),
    ]
    stored = repo.add_line_items(items)
    assert [s.id for s in stored] == [2, 3]  # doc took id 1
    fetched = repo.get_line_items(doc.id)
    assert {f.normalized_text for f in fetched} == {"pos paystack", "bank charges"}


def test_record_generated_file():
    repo = InMemoryRepository()
    eng = repo.create_engagement(CLIENT, "FY2025", "pnl")
    gid = repo.record_generated_file(eng.id, "pnl", "1.0.0", "passed", sha256="ff", recompute_engine="lo-24.2")
    assert isinstance(gid, int)

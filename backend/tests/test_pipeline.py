"""Ingest scan-stage round-trip (Phase 2a gate: upload → scan → status)."""
from litchai.db import InMemoryRepository
from litchai.pipeline import ingest_document
from litchai.scanning import NoopScanner, ScanResult
from litchai.storage import Storage

CLIENT = "11111111-1111-1111-1111-111111111111"


def _received_doc(repo, storage, ciphertext=b"envelope"):
    source_hash = "hash-" + str(len(ciphertext))
    doc = repo.create_document(CLIENT, "gt.pdf", "application/pdf", source_hash, len(ciphertext))
    storage.store(CLIENT, source_hash, ciphertext)
    return doc


def test_clean_scan_advances_to_extracting_with_progress(tmp_path):
    repo = InMemoryRepository()
    storage = Storage(root=tmp_path)
    doc = _received_doc(repo, storage)

    result = ingest_document(repo, storage, doc.id)

    assert result.status == "extracting"
    assert result.progress["stage"] == "extracting"
    trail = [e.to_state for e in repo.audit_trail("document", doc.id)]
    assert trail == ["received", "scanning", "extracting"]


def test_decrypt_is_applied_before_scan(tmp_path):
    repo = InMemoryRepository()
    storage = Storage(root=tmp_path)
    doc = _received_doc(repo, storage, ciphertext=b"XXXX")
    seen = {}

    class SpyScanner(NoopScanner):
        def scan(self, data):
            seen["data"] = data
            return super().scan(data)

    ingest_document(repo, storage, doc.id, scanner=SpyScanner(), decrypt=lambda b: b"PLAIN:" + b)
    assert seen["data"] == b"PLAIN:XXXX"


def test_infected_document_is_rejected(tmp_path):
    repo = InMemoryRepository()
    storage = Storage(root=tmp_path)
    doc = _received_doc(repo, storage)

    class Infected:
        name = "clamav"

        def scan(self, data):
            return ScanResult(clean=False, signature="Eicar-Test-Signature", scanner="clamav")

    result = ingest_document(repo, storage, doc.id, scanner=Infected())
    assert result.status == "rejected"
    last = repo.audit_trail("document", doc.id)[-1]
    assert last.to_state == "rejected"
    assert last.detail["signature"] == "Eicar-Test-Signature"

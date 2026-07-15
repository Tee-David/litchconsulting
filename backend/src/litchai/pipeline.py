"""Ingest orchestration (Phase 2a scan stage; extraction continues in Phase 2b).

Drives a document through the state machine with progress written at each step:
``received → scanning → extracting`` (clean) or ``→ rejected`` (malware/format).
The blind-relay ciphertext is decrypted **in memory** here and never written
back to disk. Every status change goes through the repo's state-machine method,
so the audit trail (FR9) is complete by construction.
"""
from __future__ import annotations

from collections.abc import Callable

from litchai.db.repo import Document, Repository
from litchai.documents.state import DocumentStatus
from litchai.scanning import NoopScanner, Scanner
from litchai.storage import Storage

Decryptor = Callable[[bytes], bytes]


def _identity(data: bytes) -> bytes:  # local/test default; the VM injects the real decryptor
    return data


def ingest_document(
    repo: Repository,
    storage: Storage,
    document_id: int,
    *,
    scanner: Scanner | None = None,
    decrypt: Decryptor | None = None,
) -> Document:
    scanner = scanner or NoopScanner()
    decrypt = decrypt or _identity

    doc = repo.get_document(document_id)
    if doc is None:
        raise ValueError(f"unknown document {document_id}")

    ciphertext = storage.read(doc.client_id, doc.source_hash)
    plaintext = decrypt(ciphertext)  # only in-memory place plaintext exists on the VM

    repo.transition_document(document_id, DocumentStatus.SCANNING, {"scanner": scanner.name})
    result = scanner.scan(plaintext)
    if not result.clean:
        repo.set_document_progress(document_id, {"stage": "rejected", "scan": "infected"})
        return repo.transition_document(
            document_id,
            DocumentStatus.REJECTED,
            {"reason": "malware", "signature": result.signature, "scanner": result.scanner},
        )

    repo.set_document_progress(document_id, {"stage": "scanned", "scan": "clean", "bytes": len(plaintext)})
    repo.transition_document(document_id, DocumentStatus.EXTRACTING, {})
    return repo.set_document_progress(document_id, {"stage": "extracting"})

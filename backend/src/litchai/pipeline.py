"""Ingest orchestration (Phase 2a scan stage; extraction continues in Phase 2b).

Drives a document through the state machine with progress written at each step:
``received → scanning → extracting`` (clean) or ``→ rejected`` (malware/format).
The blind-relay ciphertext is decrypted **in memory** here and never written
back to disk. Every status change goes through the repo's state-machine method,
so the audit trail (FR9) is complete by construction.
"""
from __future__ import annotations

from collections.abc import Callable

from litchai.categorize import NORMALIZER_VERSION, normalize_narration
from litchai.db.repo import Document, LineItem, Repository
from litchai.documents.state import DocumentStatus
from litchai.extraction import engine_for
from litchai.extraction.balance import check_continuity
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


def extract_document(
    repo: Repository,
    storage: Storage,
    document_id: int,
    *,
    decrypt: Decryptor | None = None,
) -> Document:
    """Extract stage (Phase 2b): extracting → extracted. Picks an engine, runs
    the balance-continuity gate, and normalizes rows into ``line_items`` with
    provenance. Categorization is Phase 3 (runs from the ``extracted`` state)."""
    decrypt = decrypt or _identity
    doc = repo.get_document(document_id)
    if doc is None:
        raise ValueError(f"unknown document {document_id}")

    plaintext = decrypt(storage.read(doc.client_id, doc.source_hash))
    engine = engine_for(doc.mime, doc.filename)
    result = engine.extract(plaintext)
    continuity = check_continuity(result)
    break_rows = {b.row_index for b in continuity.breaks}

    items: list[LineItem] = []
    for idx, row in enumerate(result.rows):
        flags = list(row.flags)
        if idx in break_rows:
            flags.append("balance_break")
        direction = "in" if row.amount > 0 else "out" if row.amount < 0 else None
        items.append(
            LineItem(
                id=0,
                document_id=document_id,
                raw_text=row.raw_text,
                normalized_text=normalize_narration(row.raw_text),
                direction=direction,
                amount=float(abs(row.amount)),
                page_ref=row.page_ref,
                sheet_ref=row.sheet_ref,
                row_ref=row.row_ref,
                txn_date=row.txn_date,
                flags=flags,
                taxonomy_version=None,
                needs_review=bool(flags),
            )
        )
    repo.add_line_items(items)
    repo.set_document_extraction_engine(document_id, engine.name)
    repo.set_document_progress(
        document_id,
        {
            "stage": "extracted",
            "rows": len(items),
            "engine": engine.name,
            "sheet_type": result.sheet_type,
            "continuity_ok": continuity.ok,
            "continuity_breaks": len(continuity.breaks),
            "normalizer_version": NORMALIZER_VERSION,
        },
    )
    return repo.transition_document(
        document_id,
        DocumentStatus.EXTRACTED,
        {"engine": engine.name, "rows": len(items), "continuity_ok": continuity.ok},
    )

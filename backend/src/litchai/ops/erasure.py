"""NDPA client erasure (Phase 6).

Right-to-erasure covering the *learning store* (added 2026-07-15): narration text
in ``category_memory`` is personal data, so erasure deletes the client's documents
+ line items + client-scoped memory, and flags firm-global memory rows that carry
the erased client's narration text (they may have promoted from this client) for
operator review/purge. The runbook is in ``deploy/RUNBOOK.md``.
"""
from __future__ import annotations

from dataclasses import dataclass

from litchai.categorize.memory_store import MemoryStore
from litchai.db.repo import Repository


@dataclass(frozen=True)
class ErasureReport:
    client_id: str
    documents: int
    line_items: int
    engagements: int
    client_memory: int
    global_flagged: int


def erase_client(repo: Repository, store: MemoryStore, client_id: str) -> ErasureReport:
    # Capture the client's narration texts before deleting, so we can flag any
    # firm-global memory that shares them.
    texts = {
        li.normalized_text
        for doc in repo.list_documents(client_id)
        for li in repo.get_line_items(doc.id)
    }
    line_items = sum(len(repo.get_line_items(doc.id)) for doc in repo.list_documents(client_id))

    counts = repo.delete_client_data(client_id)
    client_memory = store.delete_client(client_id)
    global_flagged = store.mark_stale_by_text(texts)

    return ErasureReport(
        client_id=client_id,
        documents=counts.get("documents", 0),
        line_items=counts.get("line_items", line_items),
        engagements=counts.get("engagements", 0),
        client_memory=client_memory,
        global_flagged=global_flagged,
    )

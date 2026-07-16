"""Correction-apply loop + dual-write (Phase 4).

Every accepted correction is a **dual-write**: an audit record in ``corrections``
AND a retrieval row in ``category_memory`` (``source=human_correction``), so the
same narration is resolved by rungs 1-3 next time — the learning loop that closes
FR8. Category corrections are the v1 corrections-only surface.

Flagged-value / structural edits go the safe way: the AI never edits a cell:
a structured **contract** edit is re-compiled and re-gated (LibreOffice recompute),
so the arithmetic is verified before anything is accepted (PRD §3, §11b).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from litchai.categorize.memory_store import MemoryRecord, MemoryStore
from litchai.db.repo import LineItem, Repository
from litchai.embeddings import Embedder
from litchai.taxonomy import Taxonomy

# A human correction should outvote seeds and auto-runs at rung 1.
HUMAN_CORRECTION_WEIGHT = 3.0


class CorrectionError(ValueError):
    pass


def apply_category_correction(
    repo: Repository,
    store: MemoryStore,
    *,
    line_item: LineItem,
    new_code: str,
    taxonomy: Taxonomy,
    client_id: str | None,
    embedder: Embedder | None = None,
) -> None:
    """Recategorize one line item. Dual-writes the audit record and the retrieval
    row so the ladder learns it. Raises if ``new_code`` isn't a postable leaf."""
    if new_code not in {c.code for c in taxonomy.postable_leaves()}:
        raise CorrectionError(f"{new_code!r} is not a postable category")

    repo.add_correction(
        line_item_id=line_item.id,
        field_changed="category_code",
        old_value=line_item.category_code,
        new_value=new_code,
        normalized_text=line_item.normalized_text,
    )
    repo.set_line_item_category(
        line_item.id,
        category_code=new_code,
        category_source="human",
        confidence=1.0,
        taxonomy_version=taxonomy.version,
        needs_review=False,
    )
    embedding = embedder.embed_documents([line_item.normalized_text])[0] if embedder else None
    store.add(
        MemoryRecord(
            id=0,
            normalized_text=line_item.normalized_text,
            category_code=new_code,
            source="human_correction",
            client_id=client_id,
            weight=HUMAN_CORRECTION_WEIGHT,
            embedding=embedding,
            embedding_model=embedder.model if embedder else None,
            taxonomy_version=taxonomy.version,
        )
    )


@dataclass(frozen=True)
class GateResult:
    passed: bool
    errors: list[str]


def recompile_and_regate(
    contract,
    edit: Callable[[object], object],
    *,
    compile_fn: Callable[[object], object],
    gate_fn: Callable[[object], list[str]],
):
    """The safety model for a value/structural correction: apply the structured
    edit to the *contract*, re-compile, and re-gate. Returns ``(GateResult,
    compiled | None)``; the caller only accepts the change when it passes. The
    AI proposes the edit; the compiler executes; the gate verifies — the number
    is never touched by generation."""
    edited = edit(contract)
    compiled = compile_fn(edited)
    errors = gate_fn(compiled)
    result = GateResult(passed=not errors, errors=errors)
    return result, (compiled if result.passed else None)

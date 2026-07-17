"""Ingest orchestration (Phase 2a scan stage; extraction continues in Phase 2b).

Drives a document through the state machine with progress written at each step:
``received → scanning → extracting`` (clean) or ``→ rejected`` (malware/format).
The blind-relay ciphertext is decrypted **in memory** here and never written
back to disk. Every status change goes through the repo's state-machine method,
so the audit trail (FR9) is complete by construction.
"""
from __future__ import annotations

import hashlib
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from litchai.categorize import NORMALIZER_VERSION, normalize_narration
from litchai.categorize.ladder import DEFAULT_CONFIG, LadderConfig, LlmClassify, classify
from litchai.categorize.memory_store import MemoryStore
from litchai.db.repo import Document, LineItem, Repository
from litchai.documents.state import DocumentStatus
from litchai.embeddings import Embedder
from litchai.extraction import engine_for
from litchai.extraction.balance import check_continuity
from litchai.scanning import NoopScanner, Scanner
from litchai.storage import Storage
from litchai.taxonomy import Taxonomy

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


def categorize_document(
    repo: Repository,
    document_id: int,
    *,
    store: MemoryStore,
    taxonomy: Taxonomy,
    embedder: Embedder | None = None,
    llm_classify: LlmClassify | None = None,
    config: LadderConfig = DEFAULT_CONFIG,
) -> Document:
    """Categorize stage (Phase 3): extracted → categorizing → categorized.

    Runs the ladder once per **distinct** normalized narration (the 80-page ≈
    ~300-distinct dedupe) and applies the decision to every line item sharing it,
    logging one ``categorization_events`` row per item. The client's own memory +
    firm-global memory are both in scope."""
    doc = repo.get_document(document_id)
    if doc is None:
        raise ValueError(f"unknown document {document_id}")

    repo.transition_document(document_id, DocumentStatus.CATEGORIZING, {})
    items = repo.get_line_items(document_id)

    decisions = {}
    for text in {li.normalized_text for li in items}:
        decisions[text] = classify(
            text, client_id=doc.client_id, store=store, taxonomy=taxonomy,
            embedder=embedder, llm_classify=llm_classify, config=config,
        )

    review_count = 0
    for li in items:
        decision = decisions[li.normalized_text]
        needs_review = decision.needs_review or bool(li.flags)  # keep extraction flags
        review_count += int(needs_review)
        repo.set_line_item_category(
            li.id,
            category_code=decision.category_code,
            category_source=decision.source,
            confidence=decision.confidence,
            taxonomy_version=taxonomy.version,
            needs_review=needs_review,
        )
        for event in decision.events:
            repo.add_categorization_event(
                line_item_id=li.id,
                normalized_text=decision.normalized_text,
                rung=event.rung,
                candidates=[c.__dict__ for c in event.candidates],
                threshold=event.threshold,
                accepted=event.accepted,
                chosen_code=event.chosen_code,
                taxonomy_version=taxonomy.version,
            )

    repo.set_document_progress(
        document_id,
        {
            "stage": "categorized",
            "distinct_narrations": len(decisions),
            "needs_review": review_count,
            "taxonomy_version": taxonomy.version,
        },
    )
    return repo.transition_document(
        document_id,
        DocumentStatus.CATEGORIZED,
        {"distinct": len(decisions), "needs_review": review_count},
    )


# --- engagement compile (Phase 4) ------------------------------------------

_VARIANT_FOR_TEMPLATE = {"annual_report_ias1": "ias1", "annual_report_ifrs18": "ifrs18"}


@dataclass(frozen=True)
class CompileResult:
    ok: bool
    generated_file_id: int
    errors: list[tuple]          # (sheet, row, col, token) from find_workbook_errors
    review_pack: object          # litchai.review.facts.ReviewPack
    lineage: object              # mapping LineageEntry list


def compile_engagement(
    repo: Repository,
    engagement_id: int,
    *,
    taxonomy: Taxonomy,
    workdir: str | Path | None = None,
    storage: Storage | None = None,
) -> CompileResult:
    """Compile one engagement's categorized line items into its deliverable
    workbook and gate it (LibreOffice recompute). Aggregates across every
    document in the engagement → mapping contract → compiler → recompute →
    ReviewPack. Records the generated file and moves ``open → in_review``.

    Only the annual-report templates compile to a full workbook today; the five
    single-sheet compilers reach here as they gain an engagement contract."""
    from litchai.compilers.annual_report import compile_annual_report
    from litchai.mapping import LineItemRow, aggregate, build_annual_report_contract
    from litchai.review.facts import build_workbook_review_pack
    from litchai.validation import recompute

    eng = repo.get_engagement(engagement_id)
    if eng is None:
        raise ValueError(f"unknown engagement {engagement_id}")
    variant = _VARIANT_FOR_TEMPLATE.get(eng.template)
    if variant is None:
        raise ValueError(f"engagement template {eng.template!r} has no workbook compiler")

    rows: list = []
    for doc in repo.list_documents(eng.client_id):
        if doc.engagement_id != engagement_id:
            continue
        for li in repo.get_line_items(doc.id):
            if li.category_code and li.direction in ("in", "out"):
                rows.append(LineItemRow(li.id, li.category_code, li.direction, li.amount))

    totals = aggregate(rows, taxonomy)
    contract, lineage = build_annual_report_contract(totals, eng.aux_inputs or {}, variant, taxonomy)
    compiled = compile_annual_report(contract)

    ctx = tempfile.TemporaryDirectory() if workdir is None else None
    base = Path(workdir) if workdir is not None else Path(ctx.name)  # type: ignore[union-attr]
    try:
        path = base / f"engagement_{engagement_id}.xlsx"
        compiled.workbook.save(path)
        grids = recompute.recompute_workbook(path)
        errors = recompute.find_workbook_errors(grids)
        pack = build_workbook_review_pack("annual_report", compiled, grids, contract)
        blob = path.read_bytes()
        sha = hashlib.sha256(blob).hexdigest()
        # Persist the deliverable before the temp dir evaporates — otherwise the
        # only trace of a compile is its sha256 and the workbook is unreachable.
        (storage or Storage()).store_artifact(sha, blob)
    finally:
        if ctx is not None:
            ctx.cleanup()

    gid = repo.record_generated_file(
        engagement_id,
        eng.template,
        compiled.compiler_version,
        "passed" if not errors else "failed",
        sha256=sha,
        recompute_engine="libreoffice",
        taxonomy_version=taxonomy.version,
    )
    if not errors and eng.status == "open":
        repo.transition_engagement(engagement_id, "in_review", {"generated_file_id": gid})
    return CompileResult(ok=not errors, generated_file_id=gid, errors=errors, review_pack=pack, lineage=lineage)

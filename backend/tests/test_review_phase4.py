"""Phase 4 review backend: queue, articulation, lineage, materiality,
assistant (intent classification), correction dual-write + learning loop."""
import json
from datetime import date

from litchai.ai import FakeProvider, InMemoryCache, InMemoryTelemetry
from litchai.categorize.ladder import classify
from litchai.categorize.memory_store import InMemoryStore
from litchai.db import InMemoryRepository, LineItem
from litchai.review.articulation import (
    CurrentOpenings,
    PriorPeriod,
    check_articulation,
    check_cutoff,
)
from litchai.review.assistant import ProposedCorrection, answer
from litchai.review.corrections import CorrectionError, apply_category_correction, recompile_and_regate
from litchai.review.facts import Anomaly, CellExplanation, ReviewPack, SectionSummary
from litchai.review.lineage import LineageLine, rollup_figure
from litchai.review.materiality import apply_materiality
from litchai.review.queue import ReviewItem, rank_review_queue
from litchai.taxonomy import load_taxonomy

TAXO = load_taxonomy()
CLIENT = "c-1"


# --- risk-based queue ------------------------------------------------------


def test_queue_orders_by_amount_uncertainty_novelty():
    items = [
        ReviewItem(1, "small sure", 100.0, 0.99, "exact", True),
        ReviewItem(2, "big unsure llm", 1_000_000.0, 0.5, "llm", True),
        ReviewItem(3, "medium", 5000.0, 0.7, "trigram", True),
    ]
    ranked = rank_review_queue(items)
    assert [r.item.line_item_id for r in ranked][0] == 2  # big + uncertain + novel floats up
    assert ranked[0].risk > ranked[-1].risk


def test_queue_skips_non_flagged_by_default():
    items = [
        ReviewItem(1, "a", 100.0, 0.9, "exact", False),
        ReviewItem(2, "b", 100.0, 0.5, "llm", True),
    ]
    ranked = rank_review_queue(items)
    assert [r.item.line_item_id for r in ranked] == [2]


# --- articulation + cutoff -------------------------------------------------


def test_articulation_flags_restatement():
    prior = PriorPeriod(closing_cash=2450.0, retained_earnings=1000.0, profit=4900.0, dividends=400.0, ppe_nbv=50000.0)
    current = CurrentOpenings(opening_cash=2450.0, opening_retained_earnings=5500.0, opening_ppe_nbv=49000.0)
    breaks = check_articulation(prior, current)
    figures = {b.figure for b in breaks}
    assert "cash" not in figures                    # ties out
    assert "retained_earnings" not in figures       # 1000 + 4900 - 400 = 5500 ✓
    assert "ppe_nbv" in figures                      # 49000 ≠ 50000 → restatement
    assert next(b for b in breaks if b.figure == "ppe_nbv").delta == -1000.0


def test_cutoff_flags_out_of_period():
    lines = [(1, date(2026, 1, 15)), (2, date(2025, 12, 20)), (3, None)]
    breaks = check_cutoff(lines, date(2026, 1, 1), date(2026, 12, 31))
    assert [b.line_item_id for b in breaks] == [2]


# --- lineage ---------------------------------------------------------------


def test_lineage_rollup_summary():
    lines = (
        [LineageLine(i, "exact", 0.95) for i in range(92)]
        + [LineageLine(i, "trigram", 0.8) for i in range(41)]
        + [LineageLine(i, "llm", 0.5) for i in range(9)]
    )
    roll = rollup_figure("Revenue", lines)
    assert roll.item_count == 142
    assert roll.by_source["exact"] == 92
    assert roll.by_source["memory"] == 41
    assert roll.by_source["LLM"] == 9
    assert roll.min_confidence == 0.5
    assert roll.review_worthy == 9
    assert "Revenue ← 142 items" in roll.summary()


# --- materiality -----------------------------------------------------------


def test_materiality_regrades_small_and_keeps_structural():
    anomalies = [
        Anomaly("warning", "outlier_line", "small wobble", amount=1000.0),
        Anomaly("info", "outlier_line", "huge outlier", amount=500000.0),
        Anomaly("high", "does_not_reconcile", "off by 5", amount=5.0),  # structural, has amount
    ]
    graded = apply_materiality(anomalies, materiality=50000.0)
    assert graded[0].severity == "info"    # below materiality → downgraded
    assert graded[1].severity == "high"    # ≥ 3× materiality → high
    assert graded[2].severity == "high"    # structural never downgraded


# --- assistant (explain-only; edits become proposals) ----------------------


def _pack():
    return ReviewPack(
        template="pnl",
        compiler_version="1.0.0",
        explanations=[
            CellExplanation("net_profit", "B10", "computed", "=B8-B9", ["B8", "B9"], 4900.0)
        ],
        anomalies=[],
        summaries=[SectionSummary("Revenue", 10000.0, None)],
    )


def test_assistant_explains_from_reviewpack_only():
    provider = FakeProvider(
        responder=lambda p: json.dumps({"intent": "explain_cell", "target": "net_profit", "value": None})
    )
    resp = answer("how did you get net profit?", _pack(), provider=provider)
    assert resp.intent == "explain_cell"
    assert "4,900" in resp.answer                 # value comes from the ReviewPack, not the LLM
    assert resp.grounded_refs == ["B10"]
    assert resp.proposed_correction is None


def test_assistant_edit_becomes_proposal_not_action():
    provider = FakeProvider(
        responder=lambda p: json.dumps({"intent": "recategorize", "target": "row 5", "value": "admin.it_comm"})
    )
    resp = answer("reclassify row 5 as IT", _pack(), provider=provider, cache=InMemoryCache(), telemetry=InMemoryTelemetry())
    assert resp.proposed_correction == ProposedCorrection("recategorize", "row 5", "admin.it_comm")
    assert resp.needs_review is True


# --- correction dual-write closes the learning loop ------------------------


def test_category_correction_dual_writes_and_closes_loop():
    repo = InMemoryRepository()
    store = InMemoryStore()
    doc = repo.create_document(CLIENT, "s.xlsx", "application/pdf", "h", 10)
    [li] = repo.add_line_items([
        LineItem(id=0, document_id=doc.id, raw_text="POS PAYSTACK", normalized_text="paystack",
                 direction="in", amount=1000.0, category_code="revenue.goods",
                 category_source="trigram", confidence=0.7, needs_review=True)
    ])

    # before: the ladder is cold on "paystack"
    assert classify("paystack", client_id=CLIENT, store=store, taxonomy=TAXO).rung == 0

    apply_category_correction(
        repo, store, line_item=li, new_code="revenue.services", taxonomy=TAXO, client_id=CLIENT
    )

    # audit written + line updated
    corr = repo.get_corrections(li.id)
    assert corr[0]["old_value"] == "revenue.goods" and corr[0]["new_value"] == "revenue.services"
    assert repo.get_line_items(doc.id)[0].category_source == "human"

    # learning loop: same narration now resolves at rung 1 to the corrected code
    after = classify("paystack", client_id=CLIENT, store=store, taxonomy=TAXO)
    assert after.rung == 1
    assert after.category_code == "revenue.services"


def test_category_correction_rejects_non_postable_code():
    repo = InMemoryRepository()
    store = InMemoryStore()
    doc = repo.create_document(CLIENT, "s.xlsx", "application/pdf", "h", 10)
    [li] = repo.add_line_items([
        LineItem(id=0, document_id=doc.id, raw_text="x", normalized_text="x", direction="in", amount=1.0)
    ])
    try:
        apply_category_correction(repo, store, line_item=li, new_code="revenue", taxonomy=TAXO, client_id=CLIENT)
        raise AssertionError("expected CorrectionError")
    except CorrectionError:
        pass


def test_recompile_and_regate_blocks_a_broken_edit():
    # generic safety wrapper: a failing gate returns not-passed and no compiled output
    result, compiled = recompile_and_regate(
        {"revenue": 100},
        edit=lambda c: {**c, "revenue": -100},
        compile_fn=lambda c: c,
        gate_fn=lambda c: ["revenue negative"] if c["revenue"] < 0 else [],
    )
    assert result.passed is False
    assert compiled is None
    assert result.errors == ["revenue negative"]

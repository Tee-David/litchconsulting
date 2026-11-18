"""Financial analysis and TB look-up (plan v4, slice 2), on the Kanem QA trial balance.
Hand check: revenue 185.4m, gross profit 73.1m, PBT 33.05m."""
from __future__ import annotations

from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy, _workbench
from litchai.workbench.engine import _SHEET_NAME, _plan_for, _wants_analysis
from litchai.workbench.tools import run_tool


def _ctx():
    wb, conv = _workbench({"fixture": "qa_tb"})
    return wb, conv, wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)


def test_financial_analysis_builds_live_formulas_that_match_the_hand_check():
    wb, conv, ctx = _ctx()
    out = run_tool(ctx, "financial_analysis", {})
    f = out.data["figures"]
    assert (f["rev"], f["cos"], f["gp"], f["pbt"]) == (185_400_000, 112_300_000, 73_100_000,
                                                        33_050_000)
    assert f["ca"] == 46_040_000 and f["cl"] == 14_290_000 and f["wc"] == 31_750_000
    assert (f["ppe"], f["dep"], f["nbv"]) == (48_000_000, 14_200_000, 33_800_000)
    assert out.data["checks"] == {"chk_tb": "PASS", "chk_bs": "PASS", "chk_wc": "PASS",
                                  "chk_cr": "PASS"}
    assert out.batch is not None and out.batch.status == "pending"
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    sh = wb.models(conv)["doc-1"].sheets["Financial Analysis"]
    labels = {sh.value(r, 1): r for r in range(1, 80) if sh.value(r, 1)}
    for head in ("Profitability Analysis", "Liquidity Analysis", "Asset Analysis",
                 "Validation Checks"):
        assert head in labels
    rev = sh.get(labels["Revenue"], 2)
    assert rev.formula and "'Trial balance'!" in rev.formula  # a live link, not a typed value
    assert sh.value(labels["Debits equal credits"], 2) == "PASS"


def test_tb_lines_gives_the_exact_cells():
    _, _, ctx = _ctx()
    rows = run_tool(ctx, "tb_lines", {"line": "cash"}).data["accounts"]
    assert rows and rows[0]["dr"] == "C6"


def test_the_analysis_request_routes_to_the_tool_without_a_model():
    ask = ('Using the existing FY2025 Trial Balance worksheet, create a new worksheet called '
           '"Financial Analysis". Do not modify any existing data. Calculate gross profit '
           'margin, working capital and the current ratio.')
    assert _wants_analysis(ask)
    assert _SHEET_NAME.search(ask).group(1) == "Financial Analysis"
    assert _plan_for(True)(ask) == [("financial_analysis", {})]
    # a small edit is never swapped for a whole analysis sheet
    assert not _wants_analysis("add a gross margin column next to revenue")
    assert not _wants_analysis("reconcile the bank and show the margins")


def test_a_specific_tb_question_goes_to_the_model_not_the_canned_answer():
    from litchai.workbench.engine import _tb_question

    assert not _tb_question("Which three expense accounts are the largest, and what share "
                            "of revenue is each?")
    assert _tb_question("what is the profit before tax")
    assert _tb_question("does the trial balance balance")

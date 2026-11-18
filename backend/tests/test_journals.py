"""Year-end tools (plan v4 slice 4): journals + adjusted TB, loan schedule, depreciation.
Loan and depreciation figures are the Ebube Sage-test answer key."""
from __future__ import annotations

import pytest

from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy, _workbench
from litchai.workbench.context import ToolError
from litchai.workbench.tools import run_tool


def _ctx():
    wb, conv = _workbench({"fixture": "qa_tb"})
    return wb, conv, wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)


def test_journals_must_balance():
    _, _, ctx = _ctx()
    with pytest.raises(ToolError, match="does not balance"):
        run_tool(ctx, "post_journals", {"journals": [{"reason": "x", "lines": [
            {"account": "1300", "debit": 100}, {"account": "4000", "credit": 90}]}]})


def test_adjusted_tb_balances_and_statements_use_it():
    wb, conv, ctx = _ctx()
    before = run_tool(ctx, "trial_balance_statements", {"write": False}).data
    out = run_tool(ctx, "post_journals", {"journals": [
        {"reason": "closing stock", "lines": [
            {"account": "Inventories", "debit": 1_000_000},
            {"account": "Cost of sales", "credit": 1_000_000}]},
        {"reason": "accrue audit fee", "lines": [
            {"account": "6900 Audit fee", "debit": 500_000},
            {"account": "2210 Accrued audit fee", "credit": 500_000}]}]})
    adj = out.data["adjusted_tb"]
    assert adj["balanced"] == "PASS" and adj["total_debit"] == adj["total_credit"]
    assert out.data["new_accounts"] == {"6900": "Audit fee", "2210": "Accrued audit fee"}
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    ctx = wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)
    after = run_tool(ctx, "trial_balance_statements", {"write": False}).data
    assert after["sheet"] == "Adjusted TB" and after["balanced"]
    assert after["income_statement"]["profit_before_tax"] == pytest.approx(
        before["income_statement"]["profit_before_tax"] + 1_000_000 - 500_000)


def test_loan_schedule_matches_the_ebube_key():
    _, _, ctx = _ctx()
    d = run_tool(ctx, "loan_schedule", {
        "principal": 60_000_000, "disbursed": "2025-03-03", "monthly_rate_pct": 2,
        "principal_repayment": 2_500_000, "first_repayment": "2025-04-03",
        "year_end": "2025-12-31", "fee_pct": 1}).data
    assert d["payments"] == 9 and d["principal_at_year_end"] == 37_500_000
    assert d["interest_paid"] == 9_000_000 and d["accrued_interest"] == 677_419.35
    assert d["finance_cost"] == 10_277_419.35 and d["accrual_days"] == "28/31"


def test_depreciation_full_month_in_the_month_bought():
    _, _, ctx = _ctx()
    d = run_tool(ctx, "depreciation_schedule", {"year_end": "2025-12-31", "additions": [
        {"name": "Delivery van", "date": "2025-06-12", "cost": 28_000_000, "rate": 25}]}).data
    assert d["by_asset"][-1]["months"] == 7 and d["charge"] == pytest.approx(4_083_333.33)

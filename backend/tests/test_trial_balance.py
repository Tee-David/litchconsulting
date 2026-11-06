"""Trial balance → statements, the TB fast path and uncached SUM totals (live
failure 2026-11-06, QA S5–S7). Offline: the QA demo files and scripted chains."""
from __future__ import annotations

import io
import json

import pytest
from openpyxl import Workbook as XlWorkbook

from litchai.ai.provider import ProviderResponse
from litchai.ai.router import ProviderError, ProviderRouter, ProviderSpec
from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy, _workbench
from litchai.workbench.context import ToolError
from litchai.workbench.engine import TurnDeps, run_turn
from litchai.workbench.model import load_xlsx
from litchai.workbench.tools import run_tool
from litchai.workbench.trial_balance import TbAccount, looks_like_tb, map_account


def _ctx(fixture: str):
    wb, conv = _workbench({"fixture": fixture})
    return wb, conv, wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)


def test_uncached_sum_totals_are_evaluated_on_read():
    _, _, ctx = _ctx("qa_tb")
    sh = next(iter(ctx.workbooks.values())).sheets["Trial balance"]
    assert sh.get(21, 3).formula == "=SUM(C2:C20)"
    assert sh.value(21, 3) == 246_390_000 and sh.value(21, 4) == 246_390_000


def test_kanem_tb_gives_the_qa_figures_and_a_proposal():
    wb, conv, ctx = _ctx("qa_tb")
    out = run_tool(ctx, "trial_balance_statements", {})
    d = out.data
    assert d["balanced"] and d["total_debits"] == 246_390_000 and d["unmapped"] == []
    p = d["income_statement"]
    assert (p["revenue"], p["cost_of_sales"], p["gross_profit"]) == (185_400_000, 112_300_000,
                                                                      73_100_000)
    assert p["administrative_expenses"] == 38_600_000 and p["profit_before_tax"] == 33_050_000
    assert d["balance_sheet"]["balance_check"] == 0
    assert d["basis"]["rule"] and d["basis"]["source"].startswith("IAS 1")
    assert out.batch is not None and out.batch.status == "pending"
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    assert out.batch.status == "accepted"
    # the proposed sheet's own formulas give the same PBT
    sheet = wb.models(conv)["doc-1"].sheets["Income statement"]
    assert sheet.value(13, 2) == 33_050_000


def test_cit_chains_from_the_tb_without_retyping():
    _, _, ctx = _ctx("qa_tb")
    d = run_tool(ctx, "tax_compute", {"kind": "cit"}).data  # no P&L step first
    assert d["cit"] == 9_915_000 and d["development_levy"] == 1_322_000
    assert d["small_company"] is False and d["profit_source"]["net_profit"] == 33_050_000


@pytest.mark.parametrize(("code", "name", "dr", "cr", "line"), [
    ("6200", "Vehicle running costs", 1, 0, "administrative_expenses"),
    ("1500", "Motor vehicles", 1, 0, "non_current_assets"),
    ("1010", "Accumulated depreciation", 0, 1, "non_current_assets"),
    ("7000", "Interest on bank loan", 1, 0, "finance_costs"),
    ("2200", "Bank loan, Access Bank", 0, 1, "borrowings"),
    ("2100", "VAT payable", 0, 1, "tax_payables"),
    ("4100", "Rental income", 0, 1, "other_income"),
    ("6100", "Office rent", 1, 0, "administrative_expenses"),
    ("", "Cost of sales", 1, 0, "cost_of_sales"),
    ("8100", "Sundry", 0, 1, "other_income"),
])
def test_account_mapping(code, name, dr, cr, line):
    assert map_account(TbAccount(2, code, name, dr, cr))[0] == line


def _xlsx(rows, title="TB"):
    wb = XlWorkbook()
    ws = wb.active
    ws.title = title
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_unbalanced_tb_and_unmapped_accounts_are_reported_not_hidden():
    from litchai.workbench.session import InMemoryBlobStore, InMemoryConversationStore, Workbench

    data = _xlsx([["Code", "Account name", "Debit", "Credit"],
                  ["4000", "Sales", 0, 1000], ["6000", "Wages", 400, 0],
                  ["", "Mystery account", 50, 0], ["1300", "Cash at bank", 500, 0]])
    w = Workbench(InMemoryBlobStore(), InMemoryConversationStore())
    conv = w.create(client_id=None)
    w.attach_bytes(conv, data, name="tb.xlsx", document_id=1)
    out = run_tool(w.context(conv), "trial_balance_statements", {"write": False})
    assert out.data["balanced"] is False and out.data["difference"] == -50
    assert [u["name"] for u in out.data["unmapped"]] == ["Mystery account"]
    assert "does NOT balance" in out.summary


def test_a_ledger_is_not_taken_for_a_tb():
    _, _, ctx = _ctx("ledger_bank")
    assert not looks_like_tb(ctx.workbooks)
    with pytest.raises(ToolError, match="no trial balance found"):
        run_tool(ctx, "trial_balance_statements", {})


class Never:
    """A provider that must not be called."""

    def __init__(self):
        self.calls = 0

    def __call__(self, spec, messages, schema, params):
        self.calls += 1
        raise ProviderError("error", "no model expected")


@pytest.mark.parametrize(("question", "figures"), [
    ("What is the profit before tax? Show gross profit too.", ["33,050,000.00", "73,100,000.00"]),
    ("Check that this trial balance balances.", ["246,390,000.00"]),
    ("Compute CIT and the Development Levy on this profit. Is Kanem a small company?",
     ["9,915,000.00", "1,322,000.00", "not a small company"]),
])
def test_tb_questions_take_the_fast_path_with_no_model_call(question, figures):
    wb, conv, _ = _ctx("qa_tb")
    t = Never()
    router = ProviderRouter([ProviderSpec("groq", "cloud", "m", "https://g", api_key="k")],
                            transport=t)
    deps = TurnDeps(wb, router, taxonomy=_taxonomy(), categoriser=scripted_categoriser)
    events = list(run_turn(deps, conv, question))
    final = events[-1]
    assert t.calls == 0 and final["type"] == "final" and final["fast_path"]
    for f in figures:
        assert f in final["answer"], (f, final["answer"])


def test_other_jobs_on_a_tb_still_go_to_the_model():
    wb, conv, _ = _ctx("qa_tb")
    seen = []

    def reply(spec, messages, schema, params):
        seen.append(messages)
        return ProviderResponse(text=json.dumps({"action": "final", "answer": "ok"}),
                                input_tokens=1, output_tokens=1)

    router = ProviderRouter([ProviderSpec("groq", "cloud", "m", "https://g", api_key="k")],
                            transport=reply)
    deps = TurnDeps(wb, router, taxonomy=_taxonomy(), categoriser=scripted_categoriser)
    events = list(run_turn(deps, conv, "Make a chart of the expense accounts"))
    start = events[0]
    assert seen and "trial_balance_statements" in start["tools"]


def test_load_xlsx_keeps_cached_values():
    data = _xlsx([["a", "b"], [1, 2], ["=A2+B2", None]])
    m = load_xlsx(data, wb_id="x", name="x")
    assert m.sheets["TB"].value(3, 1) == 3  # uncached: evaluated

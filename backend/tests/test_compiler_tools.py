"""The seven compilers as workbench tools (research plan §2): typed inputs, Python
figures with a basis block, the schedule as a proposal, refusals in plain words,
job-group routing, and a turn deadline for the agent loop. Offline."""
from __future__ import annotations

import json
import time

import pytest
from annual_report_helpers import FIXTURES as SYNTH
from annual_report_helpers import golden_ias1, load_annual_fixture

from litchai.ai import router as router_mod
from litchai.ai.decision import HeuristicDecisionLayer, job_tools
from litchai.ai.provider import ProviderResponse
from litchai.ai.router import AllProvidersFailed, ProviderRouter, ProviderSpec
from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy, _workbench
from litchai.workbench.context import ToolError
from litchai.workbench.tools import TOOLS, TOOLS_BY_NAME, run_tool

COMPILER_TOOLS = ["ar_ap_aging", "wht_schedule", "vat_return", "payroll_schedule",
                  "statement_of_affairs", "cac_filing_tracker", "annual_report_pack"]


def _ctx(fixture: str):
    wb, conv = _workbench({"fixture": fixture})
    return wb, conv, wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)


def test_every_compiler_tool_is_registered_typed_and_short():
    for name in COMPILER_TOOLS:
        t = TOOLS_BY_NAME[name]
        assert t.kind == "write"
        assert len(t.description.split()) < 60, name
        assert t.schema()["properties"], name


@pytest.mark.parametrize(("fixture", "tool", "args", "path", "want"), [
    ("receivables", "ar_ap_aging", {"as_at": "2026-03-31"}, "buckets", {
        "not_due": 1_000_000, "b1_30": 500_000, "b31_60": 750_000, "b61_90": 250_000,
        "b90_plus": 400_000}),
    ("vendor_payments", "wht_schedule", {}, "total_wht", 575_000),
    ("vat_lines", "vat_return", {}, "net_payable", 150_000),
    ("payroll", "payroll_schedule", {}, "totals", {
        "gross_annual": 20_600_000, "pension": 1_648_000, "nhf": 0, "paye": 2_656_080,
        "net_pay": 16_295_920, "employer_pension": 2_060_000, "nsitf": 206_000}),
    ("trial_balance", "statement_of_affairs", {"as_at_label": "As at 31 March 2026"},
     "net_assets", 10_000_000),
    ("compliance", "cac_filing_tracker", {"as_at": "2026-06-30"}, "outstanding_fees", 75_000),
])
def test_figures_match_hand_goldens_and_come_with_basis_and_a_proposal(fixture, tool, args,
                                                                       path, want):
    wb, conv, ctx = _ctx(fixture)
    out = run_tool(ctx, tool, args)
    assert out.data[path] == want
    b = out.data["basis"]
    assert b["rule"] and b["config_version"] == "2026.1" and b["compiler"]
    assert out.batch is not None and out.batch.status == "pending"
    assert out.data["key_cells"] and out.citations
    # the proposal applies cleanly
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    assert out.batch.status == "accepted"


def test_explicit_lines_work_without_a_sheet():
    _, _, ctx = _ctx("ledger_bank")
    out = run_tool(ctx, "wht_schedule", {"lines": [
        {"vendor": "A", "category": "rent", "payee_type": "corporate", "gross_amount": 1_000_000},
        {"vendor": "B", "category": "consultancy", "gross_amount": 500_000, "exempt": True}]})
    assert out.data["total_wht"] == 100_000
    assert out.data["basis"]["rates"] == {"rent/corporate": 10, "consultancy/corporate": 10}
    vat = run_tool(ctx, "vat_return", {"standard_rated_sales": [{"net_amount": 2_000_000}],
                                       "vat_credit_brought_forward": 200_000})
    assert vat.data["output_vat"] == 150_000 and vat.data["net_payable"] == -50_000


def test_unknown_inputs_are_refused_never_guessed():
    _, _, ctx = _ctx("ledger_bank")
    with pytest.raises(ToolError, match="unknown WHT category 'catering'"):
        run_tool(ctx, "wht_schedule", {"lines": [{"vendor": "A", "category": "catering",
                                                  "gross_amount": 1}]})
    with pytest.raises(ToolError, match="is not a date"):
        run_tool(ctx, "ar_ap_aging", {"as_at": "soon", "items": []})
    _, _, rctx = _ctx("receivables")
    with pytest.raises(ToolError, match="no column 'Balance due'"):
        run_tool(rctx, "ar_ap_aging", {"as_at": "2026-03-31", "amount_column": "Balance due"})
    with pytest.raises(ToolError, match="invalid arguments"):
        run_tool(rctx, "ar_ap_aging", {"as_at": "2026-03-31", "bogus": 1})
    with pytest.raises(ToolError, match="annual-report inputs are incomplete"):
        run_tool(ctx, "annual_report_pack", {"contract": {"period_label": "FY"}})


def test_small_supplier_payments_are_flagged_not_exempted():
    _, _, ctx = _ctx("vendor_payments")
    d = run_tool(ctx, "wht_schedule", {}).data
    assert d["small_supplier_candidates"] == ["Ngozi Rentals", "Bola Design"]
    assert d["total_wht"] == 575_000  # still deducted
    assert "never exempted automatically" in d["basis"]["assumptions"][0]


def test_annual_report_pack_matches_the_independent_golden():
    contract = json.loads((SYNTH / "annual_report_ias1_basic.json").read_text(encoding="utf-8"))
    golden = golden_ias1(load_annual_fixture("annual_report_ias1_basic.json"))
    _, _, ctx = _ctx("ledger_bank")
    out = run_tool(ctx, "annual_report_pack", {"contract": contract})
    figs = out.data["figures"]
    compared = [k for k in golden if k in figs and isinstance(figs[k], (int, float))]
    assert len(compared) >= 15
    for k in compared:
        assert figs[k] == pytest.approx(golden[k], abs=0.5), k
    assert set(out.data["sheets"]) >= {"P&L", "SOFP", "SOCF", "Bank Recon", "Schedules"}
    assert "balance checks are zero" in out.summary


def test_job_groups_offer_the_right_compiler():
    layer = HeuristicDecisionLayer()
    cases = {
        "Age the debtors as at month end": "ar_ap_aging",
        "Prepare the WHT schedule and the credit notes to request": "wht_schedule",
        "Prepare the VAT return for Q1": "vat_return",
        "Run the payroll for March": "payroll_schedule",
        "We need a statement of affairs for the bank": "statement_of_affairs",
        "Which CAC filings are overdue?": "cac_filing_tracker",
        "Prepare the IFRS 18 annual report": "annual_report_pack",
    }
    for msg, tool in cases.items():
        assert tool in layer.select_tools(msg, list(TOOLS), k=5), msg
    assert job_tools("What sheets are in this workbook?") == []


# --- fail fast: the agent loop's turn deadline (VM retest: a 306 s wait) ----------
def test_router_deadline_clamps_each_call_and_stops_the_chain(monkeypatch):
    seen = []

    def transport(spec, messages, schema, params):
        seen.append((spec.name, params.get("timeout")))
        return ProviderResponse(text="{}", input_tokens=1, output_tokens=1)

    specs = [ProviderSpec("groq", "cloud", "m", "https://g", api_key="k", timeout=60),
             ProviderSpec("local", "local", "m", "http://l", api="ollama", timeout=180)]
    r = ProviderRouter(specs, transport=transport)
    r.complete([{"role": "user", "content": "q"}], params={"timeout": 40},
               deadline=time.monotonic() + 10)
    assert seen[0][0] == "groq" and seen[0][1] <= 10
    with pytest.raises(AllProvidersFailed) as exc:
        r.complete([{"role": "user", "content": "q"}], deadline=time.monotonic() + 1)
    assert exc.value.attempts[0].reason == "timeout"
    assert len(seen) == 1  # nothing was sent once the time was up


def test_agent_loop_gives_up_with_a_timeout_well_under_the_budget(monkeypatch):
    from litchai.ai.harness import AgentTool, Observation, run_agent_loop
    from litchai.ai.router import ProviderError

    clock = {"t": 1000.0}
    monkeypatch.setattr(time, "monotonic", lambda: clock["t"])
    monkeypatch.setattr(router_mod.time, "monotonic", lambda: clock["t"])

    def slow(spec, messages, schema, params):
        clock["t"] += params["timeout"]  # every provider times out at its limit
        raise ProviderError("timeout", "ReadTimeout")

    specs = [ProviderSpec(n, "cloud", "m", f"https://{n}", api_key="k", timeout=60)
             for n in ("groq", "cloudflare", "sambanova")]
    r = ProviderRouter(specs, transport=slow)
    tool = AgentTool("echo", "Echo", {"type": "object", "properties": {}})
    events = list(run_agent_loop(system="S {tool_menu}", user="q", tools=[tool],
                                 execute=lambda n, a, s: Observation(True, "{}"), router=r))
    last = events[-1]
    assert last["type"] == "error" and last["reason"] == "timeout"
    assert clock["t"] - 1000.0 <= 125  # the cloud turn budget is 120 s, not 306

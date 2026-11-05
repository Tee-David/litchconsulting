"""Accounting accuracy (report 5.1): profit routing, chained inputs, balances.
Offline: a scripted provider, the real tools and the fixture books."""
from __future__ import annotations

import json

import pytest
from workbench_fixtures import GOLDEN, ledger_bank_xlsx, scripted_categoriser

from litchai.ai.decision import HeuristicDecisionLayer, fallback_plan, routing_hints
from litchai.ai.provider import ProviderResponse
from litchai.ai.router import ProviderError, ProviderRouter, ProviderSpec
from litchai.taxonomy import load_taxonomy
from litchai.workbench.context import ToolError
from litchai.workbench.engine import TurnDeps, resolve_refs, run_turn
from litchai.workbench.session import InMemoryBlobStore, InMemoryConversationStore, Workbench
from litchai.workbench.tools import TOOLS, run_tool

CIT_TOTAL = round(GOLDEN["net_profit"] * 0.34, 2)  # 30% CIT + 4% development levy


def test_profit_questions_offer_the_pnl_tools_and_hint_at_them():
    layer = HeuristicDecisionLayer()
    picked = layer.select_tools("What is the net profit for the quarter?", list(TOOLS))
    assert {"categorise_rows", "build_statement"} <= set(picked)
    hints = " ".join(routing_hints("Work out the CIT and development levy on the profit"))
    assert "build_statement kind=pnl" in hints and "leave net_profit_per_accounts out" in hints
    assert "closing" in " ".join(routing_hints("Reconcile the ledger to the bank statement"))
    assert routing_hints("What sheets are in this workbook?") == []


def test_no_model_plan_builds_the_pnl_before_the_tax():
    plan = [t for t, _ in fallback_plan("work out the CIT on the profit")]
    assert plan == ["categorise_rows", "build_statement", "tax_compute"]


def test_resolve_refs():
    results = {"build_statement": {"figures": {"net_profit": 4555000.0}}}
    args = {"kind": "cit", "inputs": {"net_profit_per_accounts": "$build_statement.figures.net_profit",
                                      "turnover": 200_000_000}}
    out = resolve_refs(args, results)
    assert out["inputs"]["net_profit_per_accounts"] == 4555000.0
    with pytest.raises(ToolError):
        resolve_refs({"x": "$reconcile.difference"}, results)
    with pytest.raises(ToolError):
        resolve_refs({"x": "$build_statement.figures.nope"}, results)
    assert resolve_refs({"note": "costs $5"}, results) == {"note": "costs $5"}


def _wb():
    wbench = Workbench(InMemoryBlobStore(), InMemoryConversationStore())
    conv = wbench.create(client_id=None)
    wbench.attach_bytes(conv, ledger_bank_xlsx(), name="ledger.xlsx", document_id=1)
    return wbench, conv


def test_cit_takes_the_profit_from_the_pnl_in_the_same_turn():
    wbench, conv = _wb()
    ctx = wbench.context(conv, taxonomy=load_taxonomy(), categoriser=scripted_categoriser)
    with pytest.raises(ToolError, match="Build the P&L first"):
        run_tool(ctx, "tax_compute", {"kind": "cit", "inputs": {"turnover": 2e8}})
    run_tool(ctx, "categorise_rows", {})
    run_tool(ctx, "build_statement", {"kind": "pnl"})
    out = run_tool(ctx, "tax_compute", {"kind": "cit", "inputs": {
        "turnover": 200_000_000, "total_fixed_assets": 300_000_000}})
    assert out.data["total_tax"] == CIT_TOTAL
    assert out.data["profit_source"]["net_profit"] == GOLDEN["net_profit"]
    assert out.citations == ["'P&L'!C24"]
    assert "on net profit 4,555,000.00" in out.summary


def test_reconcile_summary_states_closing_balances():
    wbench, conv = _wb()
    ctx = wbench.context(conv, taxonomy=load_taxonomy())
    s = run_tool(ctx, "reconcile", {"write": False}).summary
    assert "Closing balance per bank 4,595,000.00" in s
    assert "closing balance per books 3,555,000.00 (opening 1,000,000.00" in s


class Script:
    def __init__(self, replies):
        self.replies = list(replies)
        self.prompts: list[str] = []

    def __call__(self, spec, messages, schema, params):
        self.prompts.append(messages[-1]["content"])
        if not self.replies:
            raise ProviderError("error", "done")
        return ProviderResponse(text=json.dumps(self.replies.pop(0)), input_tokens=1,
                                output_tokens=1)


def test_chain_turn_passes_the_pnl_profit_by_reference():
    wbench, conv = _wb()
    t = Script([
        {"plan": ["categorise", "P&L", "CIT"], "action": "tool", "tool": "categorise_rows", "args": {}},
        {"action": "tool", "tool": "build_statement", "args": {"kind": "pnl"}},
        {"action": "tool", "tool": "tax_compute", "args": {"kind": "cit", "inputs": {
            "net_profit_per_accounts": "$build_statement.figures.net_profit",
            "turnover": 200_000_000, "total_fixed_assets": 300_000_000}}},
        {"action": "final", "answer": f"Net profit is ₦4,555,000; CIT and levy total ₦{CIT_TOTAL:,.0f}."},
    ])
    router = ProviderRouter([ProviderSpec("groq", "cloud", "m", "https://g", api_key="k")], transport=t)
    deps = TurnDeps(wbench, router, taxonomy=load_taxonomy(), categoriser=scripted_categoriser)
    events = list(run_turn(deps, conv, "Build the P&L, then work out the CIT and development "
                                       "levy on the profit."))
    tax = next(e for e in events if e["type"] == "tool_result" and e["tool"] == "tax_compute")
    assert tax["ok"] and tax["data"]["total_tax"] == CIT_TOTAL
    assert "Routing notes from the decision layer" in t.prompts[0]
    final = events[-1]
    assert final["type"] == "final" and not final.get("unverified_figures")

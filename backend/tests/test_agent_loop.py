"""Agent loop (3.5) + decision layer (3.3) + workbench turn, with a scripted
provider chain — no network, no model."""
from __future__ import annotations

import json

from workbench_fixtures import GOLDEN, ledger_bank_xlsx, scripted_categoriser

from litchai.ai.decision import (
    HeuristicDecisionLayer,
    ModelDecisionLayer,
    fallback_plan,
    gate_batch,
)
from litchai.ai.harness import AgentTool, Observation, parse_turn, run_agent_loop
from litchai.ai.provider import ProviderResponse
from litchai.ai.router import ProviderError, ProviderRouter, ProviderSpec
from litchai.taxonomy import load_taxonomy
from litchai.workbench.engine import TurnDeps, first_look, run_turn
from litchai.workbench.session import InMemoryBlobStore, InMemoryConversationStore, Workbench
from litchai.workbench.tools import TOOLS, run_tool


class Scripted:
    """Transport returning queued replies per provider; raise by queuing an Exception."""

    def __init__(self, replies: dict[str, list]) -> None:
        self.replies = {k: list(v) for k, v in replies.items()}
        self.calls: list[tuple[str, list[dict]]] = []

    def __call__(self, spec, messages, schema, params):
        self.calls.append((spec.name, messages))
        queue = self.replies.get(spec.name) or []
        if not queue:
            raise ProviderError("error", "script exhausted")
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        text = item if isinstance(item, str) else json.dumps(item)
        return ProviderResponse(text=text, input_tokens=100, output_tokens=20)


def _router(replies: dict[str, list]) -> tuple[ProviderRouter, Scripted]:
    t = Scripted(replies)
    specs = [ProviderSpec("groq", "cloud", "gpt-oss-120b", "https://g", api_key="k"),
             ProviderSpec("cerebras", "cloud", "gpt-oss-120b", "https://c", api_key="k"),
             ProviderSpec("local", "local", "gemma3:4b", "http://l", api="ollama")]
    return ProviderRouter(specs, transport=t), t


ECHO = AgentTool("echo", "Echo", {"type": "object", "properties": {"x": {"type": "string"}}})


def _execute(name, args, step):
    return Observation(ok=True, text=json.dumps({"echo": args}), summary=f"echoed {args}",
                       citations=["Ledger!E2"])


def test_parse_turn_validation():
    assert parse_turn("not json", {"echo"})[1].startswith("reply was not valid JSON")
    assert "tool must be one of" in parse_turn('{"action":"tool","tool":"rm"}', {"echo"})[1]
    turn, err = parse_turn('```json\n{"action":"final","answer":"ok"}\n```', set())
    assert err is None and turn.answer == "ok"
    assert parse_turn('{"action":"final","answer":"  "}', set())[1]


def test_loop_plans_calls_a_tool_then_answers():
    router, _ = _router({"groq": [
        {"plan": ["look", "answer"], "action": "tool", "tool": "echo", "args": {"x": "1"}},
        {"action": "final", "answer": "Done.", "citations": ["Ledger!E2", "Nope!ZZ9999999"]},
    ]})
    events = list(run_agent_loop(system="S {tool_menu}", user="go", tools=[ECHO],
                                 execute=_execute, router=router, conversation_id="c1",
                                 check_citation=lambda c: c.startswith("Ledger!")))
    kinds = [e["type"] for e in events]
    assert kinds == ["start", "provider", "plan", "tool_call", "tool_result", "final"]
    final = events[-1]
    assert final["answer"] == "Done." and final["citations"] == ["Ledger!E2"]
    assert final["dropped_citations"] == ["Nope!ZZ9999999"]
    assert final["attribution"]["model"] == "groq"


def test_invalid_turn_retries_once_then_moves_to_next_provider():
    router, t = _router({
        "groq": ["garbage", '{"action": "tool", "tool": "nope"}'],
        "cerebras": [{"action": "final", "answer": "Recovered."}],
    })
    events = list(run_agent_loop(system="S", user="go", tools=[ECHO], execute=_execute,
                                 router=router, conversation_id="c2"))
    retries = [e for e in events if e["type"] == "retry"]
    assert [r["provider"] for r in retries] == ["groq", "groq"]
    assert events[-1]["type"] == "final" and events[-1]["answer"] == "Recovered."
    assert [name for name, _ in t.calls] == ["groq", "groq", "cerebras"]
    # the retry carried the error back to the model
    assert "Your reply was invalid" in t.calls[1][1][-1]["content"]


def test_provider_fallback_is_announced():
    router, _ = _router({
        "groq": [ProviderError("quota", "tokens per day")],
        "cerebras": [{"action": "final", "answer": "Hi."}],
    })
    events = list(run_agent_loop(system="S", user="go", tools=[ECHO], execute=_execute,
                                 router=router, conversation_id="c3"))
    fb = next(e for e in events if e["type"] == "fallback")
    assert fb["from"] == "groq" and fb["reason"] == "quota" and fb["to"] == "cerebras"


def test_step_limit():
    router, _ = _router({"groq": [{"action": "tool", "tool": "echo", "args": {}}] * 5})
    events = list(run_agent_loop(system="S", user="go", tools=[ECHO], execute=_execute,
                                 router=router, max_steps=2))
    assert sum(1 for e in events if e["type"] == "tool_call") == 2
    assert events[-1]["type"] == "final" and events[-1]["truncated"] is True


def test_no_model_runs_the_deterministic_plan():
    router = ProviderRouter([], transport=Scripted({}))
    seen = []

    def ex(name, args, step):
        seen.append(name)
        return Observation(ok=True, text="{}", summary=f"{name} ok")

    events = list(run_agent_loop(system="S", user="please reconcile bank to ledger",
                                 tools=[ECHO], execute=ex, router=router,
                                 fallback_plan=fallback_plan))
    assert seen == ["reconcile"]
    assert events[-1]["degraded"] is True and events[-1]["attribution"]["model"] is None


# --- decision layer ---------------------------------------------------------------------
def test_tool_selection_is_bounded_and_relevant():
    layer = HeuristicDecisionLayer()
    picked = layer.select_tools("reconcile the bank to the ledger and chart it", list(TOOLS))
    assert len(picked) <= 8
    assert picked[:2] == ["profile_workbook", "query_sql"]
    assert "reconcile" in picked and "add_chart" in picked


def test_write_gate_and_privacy_decisions():
    layer = HeuristicDecisionLayer()
    wbench = Workbench(InMemoryBlobStore(), InMemoryConversationStore())
    conv = wbench.create(client_id=None)
    wbench.attach_bytes(conv, ledger_bank_xlsx(), name="l.xlsx", document_id=1)
    ctx = wbench.context(conv, taxonomy=load_taxonomy(), categoriser=scripted_categoriser)
    safe = gate_batch(layer, run_tool(ctx, "categorise_rows", {}).batch)
    assert safe.choice == "safe"
    risky = gate_batch(layer, run_tool(ctx, "clean_values", {}).batch)
    assert risky.choice == "risky" and "overwrites" in risky.reasons[0]
    assert layer.decide("privacy", "", ["local", "cloud"], {"ai_mode": "local_only"}).choice \
        == "local"
    doc = layer.decide("doc_type", "Date Narration Withdrawal Deposit Balance",
                       ["bank_statement", "ledger", "trial_balance", "payroll"])
    assert doc.choice == "bank_statement"


def test_model_decision_layer_falls_back_when_unsure():
    sure = ModelDecisionLayer(lambda m, s: '{"choice": "ledger", "confidence": 0.9}')
    assert sure.decide("doc_type", "x", ["ledger", "payroll"]).source == "model"
    unsure = ModelDecisionLayer(lambda m, s: '{"choice": "ledger", "confidence": 0.2}')
    assert unsure.decide("doc_type", "employee gross salary",
                         ["ledger", "payroll"]).choice == "payroll"
    broken = ModelDecisionLayer(lambda m, s: "nope")
    assert broken.decide("doc_type", "employee", ["ledger", "payroll"]).source == "heuristic"


# --- the workbench turn --------------------------------------------------------------------
def _deps(replies):
    router, t = _router(replies)
    wbench = Workbench(InMemoryBlobStore(), InMemoryConversationStore())
    conv = wbench.create(client_id=None, client_name="Okonkwo Agro-Allied Ltd")
    wbench.attach_bytes(conv, ledger_bank_xlsx(), name="ledger.xlsx", document_id=7)
    deps = TurnDeps(wbench, router, taxonomy=load_taxonomy(), categoriser=scripted_categoriser)
    return deps, conv, t


def test_turn_runs_tools_records_proposals_and_masks_cloud_payloads():
    deps, conv, t = _deps({"groq": [
        {"plan": ["categorise", "build P&L"], "action": "tool", "tool": "categorise_rows",
         "args": {"sheet": "Ledger"}},
        {"action": "tool", "tool": "build_statement", "args": {"kind": "pnl"}},
        {"action": "final", "answer": "Net profit is ₦4,555,000.",
         "citations": ["'P&L'!C24"]},
    ]})
    events = list(run_turn(deps, conv, "Build the P&L for Okonkwo Agro-Allied Ltd"))
    results = [e for e in events if e["type"] == "tool_result"]
    assert [r["tool"] for r in results] == ["categorise_rows", "build_statement"]
    assert all(r["ok"] for r in results)
    pnl = results[1]["data"]["figures"]
    assert pnl["net_profit"] == GOLDEN["net_profit"]
    final = events[-1]
    assert final["citations"][0] == "'P&L'!C24" and len(final["proposals"]) == 2
    assert [b.status for b in conv.batches] == ["pending", "pending"]
    # nothing written yet
    assert len(conv.workbook_ref("doc-7").versions) == 1
    # every cloud payload was masked: the client's name never left the VM
    for _name, msgs in t.calls:
        assert all("Okonkwo Agro-Allied" not in m["content"] for m in msgs)
    stored = deps.workbench.store.get(conv.id)
    assert stored.messages[-1]["role"] == "assistant" and stored.provider == "groq"
    assert stored.mask_state["reverse"]  # the token map stays on the VM side


def test_local_only_conversation_uses_local_provider():
    deps, conv, t = _deps({"local": [{"action": "final", "answer": "ok"}]})
    conv.ai_mode = "local_only"
    list(run_turn(deps, conv, "hello"))
    assert {name for name, _ in t.calls} == {"local"}


def test_tool_error_is_fed_back_and_the_model_recovers():
    deps, conv, _ = _deps({"groq": [
        {"action": "tool", "tool": "build_statement", "args": {"kind": "pnl"}},
        {"action": "tool", "tool": "categorise_rows", "args": {}},
        {"action": "final", "answer": "Categorised first."},
    ]})
    events = list(run_turn(deps, conv, "build a p&l"))
    res = [e for e in events if e["type"] == "tool_result"]
    assert res[0]["ok"] is False and "categorise_rows first" in res[0]["error"]
    assert res[1]["ok"] is True


def test_first_look_is_deterministic():
    deps, conv, t = _deps({})
    card = first_look(deps, conv)
    assert "Reconcile bank to ledger" in card["suggestions"]
    assert "Fix the 1 text dates" in card["suggestions"]
    assert card["anomalies"]["by_kind"]["duplicate"] >= 1
    assert t.calls == []

"""Token budget (report R2-R5): stable prompt prefix, strict json_schema with a
tolerant fallback, fewer tools when confident, compact results and history, and
a zero-token fast path. Offline: scripted transports only."""
from __future__ import annotations

import json

from test_agent_loop import ECHO, _deps, _execute, _router

from litchai.ai import router as router_mod
from litchai.ai.harness import (
    AGENT_TURN_STRICT_SCHEMA,
    compact_history,
    parse_turn,
    run_agent_loop,
)
from litchai.ai.router import ProviderSpec, http_transport
from litchai.workbench.engine import compact_data, run_turn


def test_strict_turn_with_args_json_is_parsed():
    text = json.dumps({"thought": "t", "plan": None, "action": "tool", "tool": "echo",
                       "args_json": "{\"x\": \"hi\"}", "answer": None, "citations": []})
    turn, err = parse_turn(text, {"echo"})
    assert err is None and turn.args == {"x": "hi"}
    bad = json.dumps({"action": "tool", "tool": "echo", "args_json": "{nope"})
    assert parse_turn(bad, {"echo"})[1] == "args_json was not a valid JSON object"
    final = json.dumps({"thought": "", "plan": None, "action": "final", "tool": None,
                        "args_json": None, "answer": "done", "citations": []})
    assert parse_turn(final, set())[0].answer == "done"


def test_loop_sends_the_strict_schema_and_keeps_a_stable_prefix():
    seen = []
    router, t = _router({"groq": [{"action": "final", "answer": "ok"}] * 2})
    orig = t.__call__

    def spy(spec, messages, schema, params):
        seen.append((messages, params))
        return orig(spec, messages, schema, params)

    router.transport = spy
    for q in ("first question", "second question"):
        list(run_agent_loop(system="RULES\n{tool_menu}\nCONTEXT", user=q, tools=[ECHO],
                            execute=_execute, router=router))
    assert seen[0][1]["strict_schema"] is AGENT_TURN_STRICT_SCHEMA
    a, b = seen[0][0], seen[1][0]
    assert a[0] == b[0]  # the system prefix is identical across turns
    assert a[0]["content"].startswith("RULES\n- echo")
    assert a[-1]["content"] == "first question" and b[-1]["content"] == "second question"


def test_history_keeps_two_turns_in_full_and_summarises_the_rest():
    hist = []
    for i in range(6):
        hist += [{"role": "user", "content": f"question {i} " + "x" * 400},
                 {"role": "assistant", "content": f"answer {i} " + "y" * 3000}]
    recent, summary = compact_history(hist)
    assert [m["content"].split()[1] for m in recent] == ["4", "4", "5", "5"]
    assert all(len(m["content"]) <= 1502 for m in recent)
    assert "User asked: question 0" in summary and "You answered: answer 3" in summary
    assert len(summary) < 1500  # 8 lines of ~180 chars
    assert compact_history(None) == ([], "")


def test_tool_results_shown_to_the_model_are_compact():
    data = {"rows": [{"n": i} for i in range(500)], "note": "z" * 2000, "total": 12}
    small = compact_data(data)
    assert len(small["rows"]) == 21 and small["rows"][-1] == "… 480 more not shown"
    assert len(small["note"]) == 301 and small["total"] == 12


def test_confident_route_offers_five_tools_else_eight():
    deps, conv, _t = _deps({"groq": [{"action": "final", "answer": "ok"}] * 2})
    starts = []
    for q in ("Reconcile the bank statement to the ledger and match every line",
              "hello there"):
        starts.append(next(e for e in run_turn(deps, conv, q) if e["type"] == "start"))
    assert len(starts[0]["tools"]) == 5 and "reconcile" in starts[0]["tools"]
    assert len(starts[1]["tools"]) == 8


def test_overview_question_takes_the_zero_token_fast_path():
    deps, conv, t = _deps({"groq": []})
    events = list(run_turn(deps, conv, "What sheets are in this workbook?"))
    assert t.calls == []  # no model call at all
    final = events[-1]
    assert final["type"] == "final" and final["fast_path"]
    assert final["answer"].startswith("Here is what is in the workbook:")
    assert final["attribution"]["model"] is None
    assert deps.workbench.store.get(conv.id).messages[-1]["role"] == "assistant"


class _Resp:
    def __init__(self, status, body):
        self.status_code, self._body = status, body
        self.text = json.dumps(body)

    def json(self):
        return self._body


def test_strict_schema_refusal_falls_back_to_the_prompt(monkeypatch):
    import httpx

    bodies = []

    def post(url, json=None, headers=None, timeout=None):
        bodies.append(json)
        if "response_format" in json:
            return _Resp(400, {"error": {"message": "json_schema not supported"}})
        return _Resp(200, {"choices": [{"message": {"content": "{\"action\": \"final\"}"}}]})

    monkeypatch.setattr(httpx, "post", post)
    monkeypatch.setattr(router_mod, "_STRICT_OFF", set())
    spec = ProviderSpec("groq", "cloud", "m", "https://g", api_key="k",
                        params={"_prompt_json": True, "_strict_schema": True})
    msgs = [{"role": "user", "content": "q"}]
    out = http_transport(spec, msgs, {"type": "object"},
                         {"strict_schema": AGENT_TURN_STRICT_SCHEMA})
    assert out.text == "{\"action\": \"final\"}"
    assert bodies[0]["response_format"]["json_schema"]["strict"] is True
    assert "response_format" not in bodies[1] and "groq" in router_mod._STRICT_OFF
    http_transport(spec, msgs, {"type": "object"}, {"strict_schema": AGENT_TURN_STRICT_SCHEMA})
    assert "response_format" not in bodies[2]  # strict stays off for the process
    assert all(not k.startswith("_") for b in bodies for k in b)

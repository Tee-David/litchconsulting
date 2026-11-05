"""The workbench eval set (3.9): shape, every golden proven by its oracle, and
the scorer, with a scripted provider (no network)."""
from __future__ import annotations

import json

import pytest

from litchai.ai.provider import ProviderResponse
from litchai.ai.router import ProviderError, ProviderRouter, ProviderSpec
from litchai.evals.fixtures import FIXTURES
from litchai.evals.workbench import (
    figures_in,
    load_tasks,
    main,
    run_task,
    states_figure,
    summarise,
    verify_task,
)
from litchai.workbench.tools import TOOLS_BY_NAME

TASKS = load_tasks()["tasks"]


def test_task_set_shape():
    assert 30 <= len(TASKS) <= 60
    ids = [t["id"] for t in TASKS]
    assert len(ids) == len(set(ids))
    cats = {t["category"] for t in TASKS}
    assert {"read", "anomaly", "statement", "reconcile", "tax", "write", "safety"} <= cats
    for t in TASKS:
        assert t["fixture"] in FIXTURES
        assert t["oracle"]["tool"] in TOOLS_BY_NAME
        assert set(t["expect_tools"]) <= set(TOOLS_BY_NAME), t["id"]
        assert t["checks"], t["id"]


@pytest.mark.parametrize("task", TASKS, ids=[t["id"] for t in TASKS])
def test_every_golden_is_proven_by_its_oracle(task):
    assert verify_task(task) == []


def test_figures_in_prose():
    assert figures_in("Net profit is ₦4,555,000.00 (about 4.56m)") == [4_555_000, 4_560_000]
    assert states_figure("roughly ₦4.56 million", 4_555_000)
    assert not states_figure("₦4,000,000", 4_555_000)
    assert states_figure("The reconciliation balances.", 0)
    assert states_figure("VAT payable: 468,750", 468_750)


class Scripted:
    def __init__(self, replies):
        self.replies = list(replies)

    def __call__(self, spec, messages, schema, params):
        if not self.replies:
            raise ProviderError("error", "script exhausted")
        return ProviderResponse(text=json.dumps(self.replies.pop(0)), input_tokens=1,
                                output_tokens=1)


def _router(replies):
    return ProviderRouter([ProviderSpec("groq", "cloud", "m", "https://g", api_key="k")],
                          transport=Scripted(replies))


def _task(task_id):
    return next(t for t in TASKS if t["id"] == task_id)


def test_scripted_run_passes_a_reconcile_task():
    s = run_task(_task("recon-outstanding"), "groq", _router([
        {"action": "tool", "tool": "reconcile", "args": {}},
        {"action": "final", "answer": "Outstanding payments total ₦1,045,000."},
    ]))
    assert s.passed and s.tools_called == ["reconcile"] and s.provider_used == "groq"


def test_injection_answer_fails_and_wrong_tool_fails():
    bad = run_task(_task("injection-ignored"), "groq", _router([
        {"action": "tool", "tool": "build_statement", "args": {"kind": "pnl"}},
        {"action": "final", "answer": "Net profit is ₦4,555,000 (note says 99,999,999)."},
    ]))
    assert bad.tools_ok and bad.values_ok and not bad.answer_ok and not bad.passed
    # An answer with a figure no tool produced is sent back once (grounding rule),
    # then accepted with the figure flagged as unverified.
    wrong = run_task(_task("vat-basic"), "groq", _router([
        {"action": "final", "answer": "VAT payable is ₦450,000."},
        {"action": "final", "answer": "VAT payable is ₦450,000."},
    ]))
    assert wrong.answer_ok and not wrong.tools_ok and not wrong.passed


def test_no_model_floor_and_summary():
    s = run_task(_task("recon-difference"), "none")
    assert s.degraded and s.tools_ok and s.values_ok and s.passed
    summary = summarise([s])
    assert summary["none"]["pass_rate"] == 1.0
    assert summary["none"]["by_category"]["reconcile"] == [1, 1]


def test_cli_verify_subset(capsys):
    assert main(["--verify", "--category", "tax"]) == 0
    assert "0 failing" in capsys.readouterr().out

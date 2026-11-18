"""Formula trace and goal seek (research items, plan v5)."""
from __future__ import annotations

import pytest

from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy, _workbench
from litchai.workbench.tools import run_tool


def _accepted_statements():
    wb, conv = _workbench({"fixture": "qa_tb"})
    ctx = wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)
    out = run_tool(ctx, "trial_balance_statements", {})
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    return wb, conv, wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)


def test_trace_shows_precedents_and_users():
    _, _, ctx = _accepted_statements()
    d = run_tool(ctx, "trace_formula", {"sheet": "Income statement", "cell": "B6"}).data
    assert d["trace"]["formula"] == "=B4-B5" and len(d["trace"]["reads"]) == 2
    assert "'Income statement'!B10" in d["used_by"]  # operating profit uses gross profit


def test_goal_seek_finds_the_input_and_proposes_it():
    _, _, ctx = _accepted_statements()
    out = run_tool(ctx, "goal_seek", {"sheet": "Income statement", "target_cell": "B13",
                                      "target_value": 50_000_000, "changing_sheet": "Trial balance",
                                      "changing_cell": "D13"})
    # revenue (TB D13) must rise by the PBT gap: 185.4m + (50m − 33.05m)
    assert out.data["value"] == pytest.approx(202_350_000, abs=0.01)
    assert out.batch is not None and len(out.batch.ops) == 1

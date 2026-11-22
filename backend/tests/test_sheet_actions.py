"""Sage sheet actions (plan v5 slice A): sets, dependency checks, one proposal, undo."""
from __future__ import annotations

import pytest

from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy, _workbench
from litchai.workbench.context import ToolError
from litchai.workbench.tools import run_tool


def _setup():
    wb, conv = _workbench({"fixture": "qa_tb", "kind": "work"})
    ctx = wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)
    out = run_tool(ctx, "trial_balance_statements", {})  # Sage makes 2 sheets
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    return wb, conv


def _ctx(wb, conv):
    return wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)


def test_delete_all_other_sheets_is_one_risky_proposal_and_undoable():
    wb, conv = _setup()
    ctx = _ctx(wb, conv)
    out = run_tool(ctx, "sheet_actions", {"actions": [
        {"action": "delete", "which": "sage_made"}]})
    assert sorted(out.data["deleted"]) == ["Balance sheet", "Income statement"]
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    assert set(wb.models(conv)["doc-1"].sheets) == {"Trial balance"}


def test_delete_refuses_when_formulas_point_at_it_unless_kept_as_values():
    wb, conv = _setup()
    with pytest.raises(ToolError, match="point at a sheet to delete"):
        run_tool(_ctx(wb, conv), "sheet_actions", {"actions": [
            {"action": "delete", "sheet": "Trial balance"}]})
    out = run_tool(_ctx(wb, conv), "sheet_actions", {"values_first": True, "actions": [
        {"action": "delete", "sheet": "Trial balance"}]})
    assert out.data["broken_refs"] and "Source data" in out.summary
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    sh = wb.models(conv)["doc-1"].sheets["Income statement"]
    assert sh.get(4, 2).formula is None and sh.value(4, 2) == 185_400_000


def test_last_visible_sheet_stays_and_rename_copy_work():
    wb, conv = _setup()
    with pytest.raises(ToolError, match="at least one visible sheet"):
        run_tool(_ctx(wb, conv), "sheet_actions", {"allow_broken_refs": True, "actions": [
            {"action": "delete", "sheets": ["Trial balance", "Income statement",
                                            "Balance sheet"]}]})
    out = run_tool(_ctx(wb, conv), "sheet_actions", {"actions": [
        {"action": "rename", "sheet": "Balance sheet", "name": "SOFP"},
        {"action": "copy", "sheet": "Income statement"}]})
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    assert {"SOFP", "Income statement (copy)"} <= set(wb.models(conv)["doc-1"].sheets)

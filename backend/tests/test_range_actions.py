"""Sage range actions (plan v5 slice B): several actions, one proposal, exact undo."""
from __future__ import annotations

import io

import pytest
from openpyxl import load_workbook

from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy, _workbench
from litchai.workbench.context import ToolError
from litchai.workbench.range_tools import offset_formula
from litchai.workbench.tools import run_tool


def _ctx():
    wb, conv = _workbench({"fixture": "qa_tb"})
    return wb, conv, wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)


def test_offset_formula_follows_excel_copy_rule():
    assert offset_formula("=C2-D2", 3, 0) == "=C5-D5"
    assert offset_formula("=$C$2+C2+'Trial balance'!B2", 1, 1) == "=$C$2+D3+'Trial balance'!C3"
    assert offset_formula('=SUM(C2:C20)&"C2"', 0, 1) == '=SUM(D2:D20)&"C2"'


def test_sort_keeps_rows_together_and_totals_at_the_bottom():
    wb, conv, ctx = _ctx()
    out = run_tool(ctx, "range_actions", {"actions": [
        {"action": "sort", "sheet": "Trial balance", "range": "A1:D21", "by": "C",
         "descending": True}]})
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    sh = wb.models(conv)["doc-1"].sheets["Trial balance"]
    assert sh.value(1, 1) == "Account code"           # header stays
    assert sh.value(2, 3) == 112_300_000              # largest debit first
    assert sh.value(21, 3) == 246_390_000             # SUM total row stays last and still adds up


def test_several_actions_one_proposal_and_layout_undo():
    wb, conv, ctx = _ctx()
    out = run_tool(ctx, "range_actions", {"actions": [
        {"action": "style", "sheet": "Trial balance", "range": "A1:D1", "style": {"b": True}},
        {"action": "number_format", "sheet": "Trial balance", "range": "C2:D21", "format": "naira"},
        {"action": "freeze", "sheet": "Trial balance", "cell": "A2"},
        {"action": "column_width", "sheet": "Trial balance", "columns": "B", "width": 40},
        {"action": "validation", "sheet": "Trial balance", "range": "E2:E20",
         "items": ["Reviewed", "Query"]}]})
    assert len(out.data["done"]) == 5
    wb.add_batch(conv, out.batch)
    done = wb.accept(conv, out.batch.id)
    assert done.status == "accepted"
    ref = conv.workbooks[0]
    ws = load_workbook(io.BytesIO(wb.blobs.get(ref.versions[-1]["sha"])))["Trial balance"]
    assert ws.freeze_panes == "A2" and ws.column_dimensions["B"].width == 40
    assert len(ws.data_validations.dataValidation) == 1
    assert ws["C2"].number_format.startswith('"₦"')


def test_find_replace_counts_and_refuses_when_nothing_matches():
    _, _, ctx = _ctx()
    out = run_tool(ctx, "range_actions", {"actions": [
        {"action": "find_replace", "sheet": "Trial balance", "find": "GTBank",
         "replace": "Guaranty Trust Bank"}]})
    assert "1 cell" in out.data["done"][0]
    with pytest.raises(ToolError, match="was not found"):
        run_tool(ctx, "range_actions", {"actions": [
            {"action": "find_replace", "sheet": "Trial balance", "find": "zzz"}]})


def test_layout_undo_restores_the_old_layout():
    wb, conv, ctx = _ctx()
    out = run_tool(ctx, "range_actions", {"actions": [
        {"action": "freeze", "sheet": "Trial balance", "cell": "B3"},
        {"action": "validation", "sheet": "Trial balance", "range": "E2:E5", "items": ["A", "B"]}]})
    wb.add_batch(conv, out.batch)
    wb.accept(conv, out.batch.id)
    wb.undo(conv, out.batch.id)
    ws = load_workbook(io.BytesIO(wb.blobs.get(conv.workbooks[0].versions[-1]["sha"])))["Trial balance"]
    assert ws.freeze_panes in (None, "A1") and not ws.data_validations.dataValidation


def test_slips_on_the_action_tools_are_forgiven():
    from litchai.workbench.tools import validate_call

    tool, a = validate_call("sheet_actions", {"action": "freeze", "sheet": "Trial balance",
                                              "freeze_rows": 1})
    assert tool.name == "range_actions" and a.actions[0].cell == "A2"
    tool, _ = validate_call("range_actions", {"actions": [{"action": "delete", "sheet": "X"}]})
    assert tool.name == "sheet_actions"

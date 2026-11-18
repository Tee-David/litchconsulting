"""Conditional formatting (E3 part 2): rules are checked, written to the xlsx, read
back for the grid, and undone."""
from __future__ import annotations

import io

import pytest
from openpyxl import Workbook as XlWorkbook
from openpyxl import load_workbook

from litchai.workbench.condfmt import FAIL_RULE, PASS_RULE, CondFormatError, clean_rules, style_for
from litchai.workbench.model import load_xlsx
from litchai.workbench.ops import OpBuilder, apply_ops, inverse_ops


def _book() -> bytes:
    wb = XlWorkbook()
    ws = wb.active
    ws.title = "Checks"
    for i, v in enumerate(["PASS", "FAIL", "PASS", -5], start=1):
        ws.cell(row=i, column=2, value=v)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_rules_are_checked():
    with pytest.raises(CondFormatError):
        clean_rules("B1:B4", [{"when": "bigger", "value": 1, "bg": "FF0000"}])
    with pytest.raises(CondFormatError):
        clean_rules("B1:B4", [{"when": "equal", "value": "x"}])  # no style
    rng, rules = clean_rules("$b$1:$b$4", [{"when": ">", "value": 0, "fc": "#9c0006"}])
    assert rng == "B1:B4" and rules == [{"when": "greater", "value": 0, "fc": "9C0006"}]


def test_written_to_the_file_read_back_and_undone():
    data = _book()
    model = load_xlsx(data, wb_id="wb-1", name="t.xlsx")
    b = OpBuilder(model, "t")
    b.cond_format("Checks", "B1:B3", [PASS_RULE, FAIL_RULE], reason="t")
    b.cond_format("Checks", "B4", [{"when": "less", "value": 0, "fc": "9C0006"}], reason="t")
    ops = b._ops
    out = apply_ops(data, ops)
    ws = load_workbook(io.BytesIO(out))["Checks"]
    assert len(list(ws.conditional_formatting)) == 2
    sh = load_xlsx(out, wb_id="wb-1", name="t.xlsx").sheets["Checks"]
    assert style_for(sh.cond_formats, 1, 2, "PASS") == {"bg": "C6EFCE", "fc": "006100", "b": True}
    assert style_for(sh.cond_formats, 2, 2, "FAIL")["bg"] == "FFC7CE"
    assert style_for(sh.cond_formats, 4, 2, -5) == {"fc": "9C0006"}
    assert style_for(sh.cond_formats, 4, 3, -5) is None  # outside the range
    back = apply_ops(out, inverse_ops(ops), check_conflicts=False)
    assert list(load_workbook(io.BytesIO(back))["Checks"].conditional_formatting) == []

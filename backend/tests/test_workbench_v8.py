"""Workbench v8: sources are never changed; outputs go to the working book."""
from __future__ import annotations

from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy, _workbench
from litchai.workbench.sources import work_id_of
from litchai.workbench.tools import run_tool


def _ctx(wb, conv):
    return wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)


def test_adding_files_makes_no_sheets_and_outputs_go_to_the_working_book():
    wb, conv = _workbench({"fixture": "qa_tb"})
    src = conv.workbooks[0]
    assert src.kind == "source" and work_id_of(conv) is None  # nothing made on upload
    before = list(wb.models(conv)[src.id].sheets)

    out = run_tool(_ctx(wb, conv), "trial_balance_statements", {})
    wb.add_batch(conv, out.batch)
    ops = out.batch.ops
    wid = work_id_of(conv)
    assert wid and wid != src.id
    assert ops[0].op == "create_workbook" and all(o.workbook_id == wid for o in ops)
    assert any(o.op == "import_sheet" and (o.meta or {}).get("sheet") == "Trial balance"
               for o in ops)  # the statements' formulas read a read-only copy
    wb.accept(conv, out.batch.id)
    assert out.batch.status == "accepted"

    models = wb.models(conv)
    assert list(models[src.id].sheets) == before  # the source never changes
    assert {"Trial balance", "Income statement"} <= set(models[wid].sheets)
    ref = next(r for r in conv.workbooks if r.id == wid)
    assert ref.kind == "work" and "Trial balance" in ref.imports

    # The tools do not see the unchanged copy, so nothing is counted twice.
    ctx = _ctx(wb, conv)
    assert "Trial balance" not in ctx.workbooks[wid].sheets
    assert "Trial balance" in ctx.workbooks[src.id].sheets


def test_a_changed_copy_replaces_its_source_for_the_next_step():
    wb, conv = _workbench({"fixture": "ledger_bank"})
    src = conv.workbooks[0].id
    out = run_tool(_ctx(wb, conv), "categorise_rows", {"sheet": "Ledger"})
    wb.add_batch(conv, out.batch)
    wid = work_id_of(conv)
    ctx = _ctx(wb, conv)
    assert "Ledger" in ctx.workbooks[wid].sheets      # the categorised copy is used
    assert "Ledger" not in ctx.workbooks[src].sheets  # and the source sheet is hidden
    pnl = run_tool(ctx, "build_statement", {"kind": "pnl"})
    assert pnl.batch is not None and all(o.workbook_id == wid for o in pnl.batch.ops)

"""IFRS 18 management-defined performance measures note.

An empty contract list emits the nil-disclosure statement (the common case);
each supplied MPM gets a reconciliation block whose total is a formula.
"""
from __future__ import annotations

from openpyxl.worksheet.worksheet import Worksheet

from litchai.compilers._common import sheet_ref
from litchai.compilers.annual_report._rows import CUR_COL, PRI_COL, SheetWriter


def build_mpm(ws: Worksheet, contract, key_cells: dict[str, str]) -> None:
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 56
    for col in ("C", "D", "E"):
        ws.column_dimensions[col].width = 18

    w = SheetWriter(ws)
    w.title_block(
        contract.client_name,
        "Management-Defined Performance Measures (MPM) Note — IFRS 18",
        contract.period_label,
        contract.units_label,
    )
    w.note_text("What is an MPM?")
    w.note_text(
        "A management-defined performance measure is a subtotal of income and expenses used in "
        "public communications outside the financial statements."
    )
    w.note_text(
        "IFRS 18 requires MPMs to be disclosed in a single note, reconciled to the most "
        "directly comparable IFRS subtotal."
    )
    w.blank()

    if not contract.mpms:
        w.note_text(
            f"Nil disclosure: {contract.client_name} did not present or reference any "
            "management-defined performance measures for the period."
        )
        return

    for index, mpm in enumerate(contract.mpms, start=1):
        w.section(f"MPM {index}: {mpm.name}")
        if mpm.rationale:
            w.note_text(mpm.rationale)
        w.year_header()
        comparable = w.input_row(
            f"Most directly comparable IFRS subtotal ({mpm.comparable_subtotal_label})",
            mpm.comparable_subtotal.current,
            mpm.comparable_subtotal.prior,
        )
        items_first = w.row
        for item in mpm.reconciling_items:
            w.input_row(item.label, item.current, item.prior)
        w.input_row(
            "Less: Income tax effect of reconciling items",
            mpm.tax_effect.current, mpm.tax_effect.prior,
        )
        items_last = w.input_row(
            "Less: Non-controlling interest effect of reconciling items",
            mpm.nci_effect.current, mpm.nci_effect.prior,
        )
        total = w.formula_row(
            f"MPM {index} total",
            f"={CUR_COL}{comparable}+SUM({CUR_COL}{items_first}:{CUR_COL}{items_last})",
            f"={PRI_COL}{comparable}+SUM({PRI_COL}{items_first}:{PRI_COL}{items_last})",
            bold=True, border="double",
        )
        w.key(f"mpm:mpm{index}_total", total)
        w.blank()

    for name, local_ref in w.key_cells.items():
        key_cells[name] = sheet_ref(ws.title, local_ref)

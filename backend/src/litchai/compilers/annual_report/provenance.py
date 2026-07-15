"""Provenance & checks sheet — the workbook carries its own audit certificate.

Versions that produced the file (FR9) plus one live cross-sheet formula per
check cell, so a reviewer sees every must-be-zero invariant in one place
without hunting through the statements. The source-documents block joins in
Phase 4 when the pipeline exists.
"""
from __future__ import annotations

from openpyxl.worksheet.worksheet import Worksheet

from litchai.compilers._common import BOLD, SUBTLE, THOUSANDS_FMT, TITLE
from litchai.compilers.annual_report._rows import write_text

SHEET = "Provenance"


def build_provenance(
    ws: Worksheet, contract, key_cells: dict[str, str], versions: dict[str, str]
) -> None:
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 52
    ws.column_dimensions["C"].width = 18
    ws.column_dimensions["D"].width = 34

    write_text(ws, "A1", contract.client_name, font=TITLE)
    write_text(ws, "A2", "Provenance & Checks", font=BOLD)
    write_text(ws, "A3", contract.period_label)

    row = 5
    write_text(ws, f"B{row}", "Produced by", font=BOLD)
    row += 1
    for label, value in versions.items():
        write_text(ws, f"B{row}", label)
        write_text(ws, f"C{row}", value)
        row += 1

    row += 1
    write_text(ws, f"B{row}", "Built-in checks (every value must equal zero)", font=BOLD)
    row += 1
    for name in sorted(k for k in key_cells if k.split(":")[1].endswith("_check")):
        write_text(ws, f"B{row}", name)
        cell = ws[f"C{row}"]
        cell.value = f"={key_cells[name]}"
        cell.number_format = THOUSANDS_FMT
        write_text(ws, f"D{row}", "must equal 0", font=SUBTLE)
        row += 1

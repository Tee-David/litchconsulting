"""Cover sheet ("Instructions" on the IAS 1 template, "Cover Page" on IFRS 18)."""
from __future__ import annotations

from openpyxl.styles import Font
from openpyxl.worksheet.worksheet import Worksheet

from litchai.compilers.annual_report._rows import write_text

_COVER_TITLE = Font(bold=True, size=18)


def build_cover(ws: Worksheet, contract) -> None:
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["C"].width = 60
    write_text(ws, "C7", "COMPANY LOGO")
    write_text(ws, "C14", contract.client_name, font=_COVER_TITLE)
    write_text(ws, "C15", "Management report")
    write_text(ws, "C16", "Draft")
    write_text(ws, "C18", contract.as_at_label)

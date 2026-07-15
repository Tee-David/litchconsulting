"""Shared building blocks for the template compilers.

Every compiler produces a styled single-sheet workbook whose computed cells are
Excel formulas (PRD §3). This module holds the styling vocabulary, the
`CompiledTemplate` result type, and small helpers (column-letter math, the
config-version footer) so the compilers stay consistent and DRY.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from openpyxl import Workbook
from openpyxl.styles import Border, Font, Side
from openpyxl.worksheet.worksheet import Worksheet

NAIRA_FMT = '"₦"#,##0.00'
# Annual-report workbooks are stated in ₦'000 (the units line carries the ₦):
# plain thousands with parenthesised negatives, matching the firm's templates.
THOUSANDS_FMT = "#,##0;(#,##0)"

TITLE = Font(bold=True, size=14)
BOLD = Font(bold=True)
SUBTLE = Font(size=9, color="777777")
TOP_BORDER = Border(top=Side(style="thin"))
DOUBLE_TOP = Border(top=Side(style="double"))


@dataclass
class CompiledTemplate:
    workbook: Workbook
    # Named refs ("total_revenue" -> "C10") so validation and the review layer
    # can locate results without re-deriving the layout.
    key_cells: dict[str, str]
    compiler_version: str


def col_letter(index: int) -> str:
    """1 -> 'A', 26 -> 'Z', 27 -> 'AA'."""
    letters = ""
    while index > 0:
        index, rem = divmod(index - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


# A sheet name may go unquoted in a formula only when it is a plain identifier
# that cannot be mistaken for a cell reference ("SOFP" yes; "Bank Recon",
# "P&L (IFRS 18)", "A1" no).
_PLAIN_SHEET = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_CELL_LIKE = re.compile(r"[A-Za-z]{1,3}\d+")


def sheet_ref(sheet: str, ref: str) -> str:
    """Qualify a cell ref with its sheet: 'SOFP' + 'D26' -> \"SOFP!D26\",
    'Bank Recon' + 'F55' -> \"'Bank Recon'!F55\"."""
    if _PLAIN_SHEET.fullmatch(sheet) and not _CELL_LIKE.fullmatch(sheet):
        return f"{sheet}!{ref}"
    return "'" + sheet.replace("'", "''") + f"'!{ref}"


def split_sheet_ref(qualified: str) -> tuple[str | None, str]:
    """Inverse of sheet_ref: \"'Bank Recon'!F55\" -> ('Bank Recon', 'F55');
    an unqualified ref comes back as (None, ref)."""
    if "!" not in qualified:
        return None, qualified
    sheet, _, ref = qualified.rpartition("!")
    if sheet.startswith("'") and sheet.endswith("'"):
        sheet = sheet[1:-1].replace("''", "'")
    return sheet, ref


def write_footer(ws: Worksheet, ref: str, compiler_version: str, config_version: str) -> None:
    """Provenance line recorded on every generated sheet (FR9)."""
    cell = ws[ref]
    cell.value = (
        f"LitchAI · compiler {compiler_version} · tax config {config_version} · "
        "all computed cells are formulas"
    )
    cell.font = SUBTLE

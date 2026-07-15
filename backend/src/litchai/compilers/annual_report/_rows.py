"""Row vocabulary for the annual-report sheets.

Every sheet follows the firm's template convention: column A carries section
headers, B row labels, C note numbers, D the current year, E the prior year.
All computed cells are Excel formulas (PRD §3); every label is forced to
plain text so a value that *looks* like a formula (leading '=') can never
become one in a deliverable — labels will eventually originate from client
documents.
"""
from __future__ import annotations

import datetime
import io
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.worksheet.worksheet import Worksheet

from litchai.compilers._common import (
    BOLD,
    DOUBLE_TOP,
    SUBTLE,
    THOUSANDS_FMT,
    TITLE,
    TOP_BORDER,
)

SECTION_COL = "A"
LABEL_COL = "B"
NOTE_COL = "C"
CUR_COL = "D"
PRI_COL = "E"

# Deterministic workbook metadata: identical contract + versions must produce
# identical bytes, so document properties never carry the wall clock.
_FIXED_STAMP = datetime.datetime(2000, 1, 1)


def fix_workbook_properties(wb: Workbook) -> None:
    wb.properties.creator = "LitchAI"
    wb.properties.created = _FIXED_STAMP
    wb.properties.modified = _FIXED_STAMP
    wb.properties.lastModifiedBy = "LitchAI"


def save_workbook_deterministic(wb: Workbook, path: Path | str) -> None:
    """Save with fixed zip-entry timestamps so identical content produces
    identical bytes (openpyxl stamps entries with the wall clock)."""
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    with zipfile.ZipFile(buf) as src, zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            info = zipfile.ZipInfo(item.filename, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = item.external_attr
            dst.writestr(info, src.read(item.filename))


def write_text(ws: Worksheet, ref: str, text: str, *, font: Font | None = None) -> None:
    """Write a guaranteed-plain-text cell (the label-injection guard)."""
    cell = ws[ref]
    cell.value = text
    if isinstance(text, str):
        cell.data_type = "s"
    if font is not None:
        cell.font = font


@dataclass
class SheetWriter:
    """Cursor-based writer over one worksheet in the template's layout."""

    ws: Worksheet
    row: int = 1
    key_cells: dict[str, str] = field(default_factory=dict)

    def _amount(self, col: str, value_or_formula: float | str, *, bold: bool = False):
        cell = self.ws[f"{col}{self.row}"]
        cell.value = value_or_formula
        cell.number_format = THOUSANDS_FMT
        if bold:
            cell.font = BOLD
        return cell

    def title_block(self, client: str, subtitle: str, period: str, units: str) -> None:
        write_text(self.ws, f"{SECTION_COL}1", client, font=TITLE)
        write_text(self.ws, f"{SECTION_COL}2", subtitle, font=BOLD)
        write_text(self.ws, f"{SECTION_COL}3", period)
        write_text(self.ws, f"{SECTION_COL}4", units, font=SUBTLE)
        self.row = 6

    def year_header(self) -> None:
        write_text(self.ws, f"{NOTE_COL}{self.row}", "Note", font=BOLD)
        write_text(self.ws, f"{CUR_COL}{self.row}", "Current Year", font=BOLD)
        write_text(self.ws, f"{PRI_COL}{self.row}", "Prior Year", font=BOLD)
        self.row += 2

    def section(self, title: str) -> None:
        write_text(self.ws, f"{SECTION_COL}{self.row}", title, font=BOLD)
        self.row += 1

    def note_text(self, text: str) -> None:
        write_text(self.ws, f"{LABEL_COL}{self.row}", text, font=SUBTLE)
        self.row += 1

    def blank(self, n: int = 1) -> None:
        self.row += n

    def input_row(
        self, label: str, current: float, prior: float, *, note: int | None = None
    ) -> int:
        write_text(self.ws, f"{LABEL_COL}{self.row}", label)
        if note is not None:
            write_text(self.ws, f"{NOTE_COL}{self.row}", str(note))
        self._amount(CUR_COL, current)
        self._amount(PRI_COL, prior)
        self.row += 1
        return self.row - 1

    def formula_row(
        self,
        label: str,
        cur_formula: str,
        prior_formula: str | None = None,
        *,
        note: int | None = None,
        bold: bool = False,
        border: str | None = None,
    ) -> int:
        """A row whose year cells are formulas (cross-sheet links, subtotals)."""
        write_text(self.ws, f"{LABEL_COL}{self.row}", label, font=BOLD if bold else None)
        if note is not None:
            write_text(self.ws, f"{NOTE_COL}{self.row}", str(note))
        cur = self._amount(CUR_COL, cur_formula, bold=bold)
        cells = [cur]
        if prior_formula is not None:
            cells.append(self._amount(PRI_COL, prior_formula, bold=bold))
        if border == "top":
            for cell in cells:
                cell.border = TOP_BORDER
        elif border == "double":
            for cell in cells:
                cell.border = DOUBLE_TOP
        self.row += 1
        return self.row - 1

    def mixed_row(
        self, label: str, cur_formula: str, prior_value: float, *, note: int | None = None
    ) -> int:
        """Current year is a cross-sheet formula, prior year a direct input
        (SOFP PPE and cash rows — their feeds are current-period only)."""
        write_text(self.ws, f"{LABEL_COL}{self.row}", label)
        if note is not None:
            write_text(self.ws, f"{NOTE_COL}{self.row}", str(note))
        self._amount(CUR_COL, cur_formula)
        self._amount(PRI_COL, prior_value)
        self.row += 1
        return self.row - 1

    def sum_rows(self, first: int, last: int) -> tuple[str, str]:
        """SUM formulas over a row span for both year columns; a span that
        never materialised (no items) yields literal zeros, not a reversed
        range."""
        if last < first:
            return "=0", "=0"
        return (
            f"=SUM({CUR_COL}{first}:{CUR_COL}{last})",
            f"=SUM({PRI_COL}{first}:{PRI_COL}{last})",
        )

    def key(self, name: str, row: int, *, col: str = CUR_COL, prior: bool = True) -> None:
        """Record key_cells refs (sheet-local; the orchestrator qualifies them)."""
        self.key_cells[name] = f"{col}{row}"
        if prior:
            self.key_cells[f"{name}:py"] = f"{PRI_COL}{row}"

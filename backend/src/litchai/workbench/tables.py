"""Find the data table on a sheet and name its columns by role.

The AI never needs a selection: each sheet's table (header row + data rows) is
found heuristically, and columns get roles (date / description / debit / credit /
amount / balance / category) so tools can pick their own ranges.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from openpyxl.utils import get_column_letter

from litchai.workbench.model import Sheet, is_number, to_number

ROLE_HINTS: dict[str, tuple[str, ...]] = {
    "date": ("date", "value date", "trans date", "txn date", "posting date", "period"),
    "description": ("description", "narration", "details", "particulars", "remarks", "memo",
                    "account name", "item", "label", "line"),
    "debit": ("debit", "withdrawal", "withdrawals", "dr", "money out", "outflow", "payments"),
    "credit": ("credit", "deposit", "deposits", "lodgement", "cr", "money in", "inflow",
               "receipts"),
    "amount": ("amount", "value", "net", "total", "gross"),
    "balance": ("balance", "running balance", "closing balance"),
    "category": ("category", "account", "class", "classification", "gl", "type", "section"),
    "reference": ("ref", "reference", "cheque", "doc no", "voucher"),
    "counterparty": ("payee", "vendor", "supplier", "customer", "beneficiary", "counterparty"),
}


@dataclass
class Column:
    index: int          # 1-based sheet column
    name: str
    role: str | None = None

    @property
    def letter(self) -> str:
        return get_column_letter(self.index)


@dataclass
class Table:
    sheet: str
    header_row: int
    first_row: int
    last_row: int
    columns: list[Column] = field(default_factory=list)

    @property
    def n_rows(self) -> int:
        return max(0, self.last_row - self.first_row + 1)

    @property
    def a1(self) -> str:
        if not self.columns:
            return f"A{self.header_row}"
        return (f"{self.columns[0].letter}{self.header_row}:"
                f"{self.columns[-1].letter}{self.last_row}")

    def col(self, role_or_name: str | None) -> Column | None:
        if role_or_name is None:
            return None
        key = role_or_name.strip().lower()
        for c in self.columns:
            if c.role == key:
                return c
        for c in self.columns:
            if c.name.strip().lower() == key or c.letter.lower() == key:
                return c
        for c in self.columns:
            if key in c.name.strip().lower():
                return c
        return None

    def rows(self, sheet: Sheet) -> list[tuple[int, list[Any]]]:
        c0 = self.columns[0].index if self.columns else 1
        c1 = self.columns[-1].index if self.columns else sheet.max_col
        return [(r, sheet.row_values(r, c0, c1)) for r in range(self.first_row, self.last_row + 1)]

    def values(self, sheet: Sheet, col: Column) -> list[tuple[int, Any]]:
        return [(r, sheet.value(r, col.index)) for r in range(self.first_row, self.last_row + 1)]

    def amount(self, sheet: Sheet, row: int) -> float | None:
        """Signed amount for a row: credit − debit, else the amount column."""
        cr, dr, amt = self.col("credit"), self.col("debit"), self.col("amount")
        if cr or dr:
            c = to_number(sheet.value(row, cr.index)) if cr else None
            d = to_number(sheet.value(row, dr.index)) if dr else None
            if c is None and d is None:
                return None
            return (c or 0.0) - (d or 0.0)
        if amt:
            return to_number(sheet.value(row, amt.index))
        return None

    def describe(self) -> dict[str, Any]:
        return {
            "sheet": self.sheet, "range": self.a1, "header_row": self.header_row,
            "rows": self.n_rows,
            "columns": [{"letter": c.letter, "name": c.name, "role": c.role}
                        for c in self.columns],
        }


def _role_for(header: str, taken: set[str]) -> str | None:
    h = header.strip().lower()
    if not h:
        return None
    for role, hints in ROLE_HINTS.items():
        if role in taken:
            continue
        for hint in hints:
            if h == hint or h.startswith(hint + " ") or h.startswith(hint) and len(hint) > 3:
                return role
            if len(hint) > 3 and re.search(rf"\b{re.escape(hint)}\b", h):
                return role
    return None


def detect_table(sheet: Sheet) -> Table | None:
    """Header = the first row (in the top 25) with ≥2 text cells that is followed
    by a row containing data; the table runs to the last non-empty row below."""
    if not sheet.cells:
        return None
    max_r, max_c = sheet.max_row, sheet.max_col
    header_row = None
    best = 0
    for r in range(1, min(max_r, 25) + 1):
        vals = sheet.row_values(r, 1, max_c)
        texts = sum(1 for v in vals if isinstance(v, str) and v.strip())
        nums = sum(1 for v in vals if is_number(v))
        if texts >= 2 and nums == 0 and texts > best:
            below = sheet.row_values(r + 1, 1, max_c) if r < max_r else []
            if any(v is not None for v in below):
                header_row, best = r, texts
                if texts >= 3:
                    break
    if header_row is None:
        # No header: only a real grid (≥2 columns of data) counts as a table.
        if max_c < 2 or max_r < 2:
            return None
        header_row = 0  # data starts on row 1; columns are named by letter
    cols: list[Column] = []
    taken: set[str] = set()
    for c in range(1, max_c + 1):
        h = sheet.value(header_row, c)
        name = str(h).strip() if h is not None else ""
        has_data = any(sheet.value(r, c) is not None for r in range(header_row + 1, max_r + 1))
        if not name and not has_data:
            continue
        role = _role_for(name, taken)
        if role:
            taken.add(role)
        cols.append(Column(c, name or get_column_letter(c), role))
    # Trim trailing totals/footer rows: last row where ≥2 table cells are filled.
    last = header_row
    for r in range(header_row + 1, max_r + 1):
        filled = sum(1 for col in cols if sheet.value(r, col.index) is not None)
        if filled >= min(2, len(cols)):
            last = r
    return Table(sheet.name, header_row, header_row + 1, last, cols)


def detect_tables(workbook) -> dict[str, Table]:
    out = {}
    for name, sheet in workbook.sheets.items():
        t = detect_table(sheet)
        if t is not None and t.columns:
            out[name] = t
    return out

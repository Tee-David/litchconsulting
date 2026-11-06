"""In-memory workbook model the workbench tools read (Phase 3.6 / 3.8).

Every sheet of every attached document is loaded — not just the busiest one —
so the AI can work on the whole workbook without a selection. A cell carries its
cached value *and* its formula (two openpyxl passes), plus an optional
``preview`` value for formula cells written by a pending proposal (the Python
pipeline computes it; LibreOffice confirms it at apply time).

Documents that aren't spreadsheets (PDF / image bank statements) become a
synthetic ``Transactions`` sheet built from their extracted ``line_items``, with
the source page kept on every row so the UI can link a row to its PDF page.
"""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from openpyxl import Workbook as XlWorkbook
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
from openpyxl.utils.cell import column_index_from_string, coordinate_from_string

MAX_CELLS = 2_000_000  # guard: refuse absurd sheets rather than OOM the VM


def a1(row: int, col: int) -> str:
    return f"{get_column_letter(col)}{row}"


def parse_a1(ref: str) -> tuple[int, int]:
    letters, row = coordinate_from_string(ref.replace("$", "").strip().upper())
    return int(row), column_index_from_string(letters)


def parse_range(ref: str) -> tuple[int, int, int, int]:
    """'B2:F140' -> (r0, c0, r1, c1); a single cell is a 1x1 range."""
    ref = ref.replace("$", "").strip().upper()
    if ":" in ref:
        a, b = ref.split(":", 1)
        r0, c0 = parse_a1(a)
        r1, c1 = parse_a1(b)
        return min(r0, r1), min(c0, c1), max(r0, r1), max(c0, c1)
    r, c = parse_a1(ref)
    return r, c, r, c


def split_qualified(ref: str) -> tuple[str | None, str]:
    """"'Bank Recon'!C8" -> ('Bank Recon', 'C8')."""
    if "!" not in ref:
        return None, ref
    sheet, _, cell = ref.rpartition("!")
    if sheet.startswith("'") and sheet.endswith("'"):
        sheet = sheet[1:-1].replace("''", "'")
    return sheet, cell


def qualify(sheet: str, ref: str) -> str:
    import re

    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", sheet) and not re.fullmatch(
        r"[A-Za-z]{1,3}\d+", sheet
    ):
        return f"{sheet}!{ref}"
    return "'" + sheet.replace("'", "''") + f"'!{ref}"


@dataclass
class Cell:
    value: Any = None
    formula: str | None = None
    preview: Any = None          # Python-computed value of a proposed formula
    number_format: str | None = None

    @property
    def display(self) -> Any:
        if self.formula and self.value is None:
            return self.preview
        return self.value


@dataclass
class Sheet:
    name: str
    cells: dict[tuple[int, int], Cell] = field(default_factory=dict)
    source_pages: dict[int, int] = field(default_factory=dict)  # row -> PDF page

    @property
    def max_row(self) -> int:
        return max((r for r, _ in self.cells), default=0)

    @property
    def max_col(self) -> int:
        return max((c for _, c in self.cells), default=0)

    def get(self, row: int, col: int) -> Cell | None:
        return self.cells.get((row, col))

    def value(self, row: int, col: int) -> Any:
        c = self.cells.get((row, col))
        return c.display if c else None

    def set(self, row: int, col: int, cell: Cell) -> None:
        self.cells[(row, col)] = cell

    def row_values(self, row: int, c0: int = 1, c1: int | None = None) -> list[Any]:
        c1 = c1 or self.max_col
        return [self.value(row, c) for c in range(c0, c1 + 1)]

    def grid(self, r0: int = 1, c0: int = 1, r1: int | None = None,
             c1: int | None = None) -> list[list[Any]]:
        r1 = r1 or self.max_row
        c1 = c1 or self.max_col
        return [self.row_values(r, c0, c1) for r in range(r0, r1 + 1)]

    def formula_count(self) -> int:
        return sum(1 for c in self.cells.values() if c.formula)


@dataclass
class Workbook:
    id: str                      # stable id inside a conversation ('doc-12', 'new-1')
    name: str
    sheets: dict[str, Sheet] = field(default_factory=dict)
    document_id: int | None = None
    origin: str = "xlsx"         # xlsx | csv | line_items | new

    def sheet(self, name: str | None) -> Sheet:
        if name is None:
            return next(iter(self.sheets.values()))
        if name in self.sheets:
            return self.sheets[name]
        low = {k.lower(): v for k, v in self.sheets.items()}
        if name.lower() in low:
            return low[name.lower()]
        raise KeyError(f"no sheet {name!r} in {self.name} (sheets: {list(self.sheets)})")


# --- loaders --------------------------------------------------------------------
def load_xlsx(data: bytes, *, wb_id: str, name: str, document_id: int | None = None) -> Workbook:
    from litchai.extraction.sandbox import check_zip_safety

    check_zip_safety(data)
    formulas = load_workbook(io.BytesIO(data), data_only=False)
    values = load_workbook(io.BytesIO(data), data_only=True)
    out = Workbook(id=wb_id, name=name, document_id=document_id, origin="xlsx")
    total = 0
    for ws in formulas.worksheets:
        vs = values[ws.title]
        sheet = Sheet(ws.title)
        for row in ws.iter_rows():
            for c in row:
                if c.value is None:
                    continue
                total += 1
                if total > MAX_CELLS:
                    raise ValueError("workbook too large for the workbench")
                raw = c.value
                if isinstance(raw, str) and raw.startswith("="):
                    sheet.set(c.row, c.column, Cell(
                        value=vs.cell(row=c.row, column=c.column).value, formula=raw,
                        number_format=c.number_format,
                    ))
                else:
                    sheet.set(c.row, c.column, Cell(value=raw, number_format=c.number_format))
        out.sheets[ws.title] = sheet
    fill_uncached(out)
    return out


MAX_UNCACHED = 20_000  # formulas evaluated on read (files saved without cached values)


def fill_uncached(model: Workbook) -> int:
    """A file written by openpyxl (or another tool that never ran Excel) has
    formulas but no cached values, so a totals row reads as empty. Evaluate those
    formulas with the safe evaluator and keep the result as the cell's preview
    (``Sheet.value`` shows it); the formula itself is unchanged and LibreOffice
    stays the authority at apply time. Returns how many cells were filled."""
    from litchai.workbench.formula import Evaluator

    todo = [(s.name, r, c) for s in model.sheets.values() for (r, c), cell in s.cells.items()
            if cell.formula and cell.value is None and cell.preview is None]
    if not todo:
        return 0
    ev = Evaluator(model)
    filled = 0
    for name, r, c in todo[:MAX_UNCACHED]:
        cell = model.sheets[name].cells[(r, c)]
        try:
            v = ev.evaluate(cell.formula or "", name)
        except Exception:  # noqa: BLE001, S112 — unsupported function or bad ref: leave it empty
            continue
        if isinstance(v, float):
            v = round(v, 2)
        if v is not None:
            cell.preview = v
            filled += 1
    return filled


def load_csv(data: bytes, *, wb_id: str, name: str, document_id: int | None = None) -> Workbook:
    text = data.decode("utf-8-sig", errors="replace")
    sheet = Sheet("Sheet1")
    for r, row in enumerate(csv.reader(io.StringIO(text)), start=1):
        for c, v in enumerate(row, start=1):
            if v != "":
                sheet.set(r, c, Cell(value=_coerce(v)))
    return Workbook(id=wb_id, name=name, sheets={"Sheet1": sheet}, document_id=document_id,
                    origin="csv")


def from_line_items(items: list[Any], *, wb_id: str, name: str,
                    document_id: int | None = None) -> Workbook:
    """A PDF/image statement as a sheet: Date, Description, Money in, Money out,
    Category, Page — one row per extracted line item (source page kept)."""
    sheet = Sheet("Transactions")
    headers = ["Date", "Description", "Money in", "Money out", "Category", "Page"]
    for c, h in enumerate(headers, start=1):
        sheet.set(1, c, Cell(value=h))
    for r, li in enumerate(items, start=2):
        amount = float(getattr(li, "amount", 0) or 0)
        direction = getattr(li, "direction", None)
        sheet.set(r, 1, Cell(value=getattr(li, "txn_date", None)))
        sheet.set(r, 2, Cell(value=getattr(li, "raw_text", "")))
        if direction == "in":
            sheet.set(r, 3, Cell(value=amount))
        elif direction == "out":
            sheet.set(r, 4, Cell(value=amount))
        if getattr(li, "category_code", None):
            sheet.set(r, 5, Cell(value=li.category_code))
        page = getattr(li, "page_ref", None)
        if page is not None:
            sheet.set(r, 6, Cell(value=page))
            sheet.source_pages[r] = int(page)
    return Workbook(id=wb_id, name=name, sheets={"Transactions": sheet},
                    document_id=document_id, origin="line_items")


def new_workbook(wb_id: str, name: str, sheet_names: list[str] | None = None) -> Workbook:
    names = ["Sheet1"] if sheet_names is None else sheet_names
    return Workbook(id=wb_id, name=name, sheets={n: Sheet(n) for n in names}, origin="new")


def to_xlsx_bytes(model: Workbook) -> bytes:
    """Materialise a model (line-item or new workbooks) as an xlsx so the same
    apply → recompute path works for every origin."""
    wb = XlWorkbook()
    wb.remove(wb.active)
    for sheet in model.sheets.values():
        ws = wb.create_sheet(sheet.name[:31])
        for (r, c), cell in sorted(sheet.cells.items()):
            target = ws.cell(row=r, column=c)
            target.value = cell.formula or cell.value
            if cell.number_format:
                target.number_format = cell.number_format
    if not wb.worksheets:
        wb.create_sheet("Sheet1")
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _coerce(v: str) -> Any:
    s = v.strip()
    if not s:
        return None
    cleaned = s.replace(",", "").replace("₦", "").strip()
    neg = cleaned.startswith("(") and cleaned.endswith(")")
    if neg:
        cleaned = cleaned[1:-1]
    try:
        f = float(cleaned)
        f = -f if neg else f
        return int(f) if f.is_integer() and "." not in cleaned else f
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d-%b-%Y", "%d %b %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return s


def is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def is_date(v: Any) -> bool:
    return isinstance(v, (date, datetime))


def looks_like_text_date(v: Any) -> bool:
    if not isinstance(v, str):
        return False
    return is_date(_coerce(v))


def to_number(v: Any) -> float | None:
    if is_number(v):
        return float(v)
    if isinstance(v, str):
        c = _coerce(v)
        return float(c) if is_number(c) else None
    return None

"""S3: insert and delete rows and columns, with formula references following.

Cells move with openpyxl (values and styles); every formula in the workbook that
points at the changed sheet is rewritten the way Excel does: references after the
band move, ranges that cross a deleted band shrink. A reference INTO a deleted band
would become ``#REF!``; :func:`broken_by_delete` finds those first so the caller
can refuse the delete with the cells named (the recompute gate refuses ``#REF!``).
"""
from __future__ import annotations

import re
from typing import Any

from openpyxl.formula.tokenizer import Token, Tokenizer
from openpyxl.utils import column_index_from_string, get_column_letter

STRUCT_OPS = ("insert_rows", "delete_rows", "insert_cols", "delete_cols")

_RANGE = re.compile(
    r"^(?:(?P<sh>'(?:[^']|'')+'|[^!]+)!)?(?P<a>\$?[A-Za-z]{0,3}\$?\d*)(?::(?P<b>\$?[A-Za-z]{0,3}\$?\d*))?$"
)
_PART = re.compile(r"^(?P<cd>\$?)(?P<c>[A-Za-z]{0,3})(?P<rd>\$?)(?P<r>\d*)$")


def _sheet_name(raw: str | None) -> str | None:
    if raw is None:
        return None
    return raw[1:-1].replace("''", "'") if raw.startswith("'") else raw


class _Ref(Exception):
    """The reference points into a deleted band."""


def _shift(n: int, axis_at: int, count: int, delete: bool, *, end: bool | None) -> int:
    """New index for one row/column number. ``end`` is None for a single cell, True/False
    for the end/start of a range (a range end inside the band snaps to its edge)."""
    if not delete:
        return n + count if n >= axis_at else n
    last = axis_at + count - 1
    if n < axis_at:
        return n
    if n > last:
        return n - count
    if end is None:
        raise _Ref
    return axis_at - 1 if end else axis_at


def _shift_part(part: str, rows: bool, at: int, count: int, delete: bool, end: bool | None) -> str:
    m = _PART.match(part)
    if not m:
        return part
    cd, c, rd, r = m.group("cd", "c", "rd", "r")
    if rows and r:
        r = str(_shift(int(r), at, count, delete, end=end))
    elif not rows and c:
        c = get_column_letter(_shift(column_index_from_string(c.upper()), at, count, delete, end=end))
    return f"{cd}{c}{rd}{r}"


def _shift_range(value: str, rows: bool, at: int, count: int, delete: bool) -> str:
    m = _RANGE.match(value)
    if not m or not (m.group("a") or "").strip("$"):
        return value
    a, b = m.group("a"), m.group("b")
    prefix = value[: m.start("a")]
    if b is None:
        return prefix + _shift_part(a, rows, at, count, delete, None)
    na = _shift_part(a, rows, at, count, delete, False)
    nb = _shift_part(b, rows, at, count, delete, True)
    # Both ends inside the deleted band, or the range collapsed: the range is gone.
    pa, pb = _PART.match(na), _PART.match(nb)
    if pa and pb:
        key = "r" if rows else "c"
        x, y = pa.group(key), pb.group(key)
        if x and y:
            xi = int(x) if rows else column_index_from_string(x.upper())
            yi = int(y) if rows else column_index_from_string(y.upper())
            if yi < xi:
                raise _Ref
    return f"{prefix}{na}:{nb}"


def shift_formula(formula: str, *, own_sheet: str, target: str, rows: bool, at: int,
                  count: int, delete: bool) -> str:
    """Rewrite one formula for a row/column insert or delete on ``target``.
    Raises :class:`_Ref` when a reference falls inside a deleted band."""
    if not isinstance(formula, str) or not formula.startswith("="):
        return formula
    tok = Tokenizer(formula)
    out = []
    for t in tok.items:
        v = t.value
        if t.type == Token.OPERAND and t.subtype == Token.RANGE:
            m = _RANGE.match(v)
            sheet = _sheet_name(m.group("sh")) if m and m.group("sh") else own_sheet
            if m and sheet == target:
                v = _shift_range(v, rows, at, count, delete)
        out.append(v)
    return "=" + "".join(out)


def broken_by_delete(formulas: list[tuple[str, str, str]], *, target: str, rows: bool,
                     at: int, count: int) -> list[str]:
    """Cells (``Sheet!A1``) whose formula points into the band being deleted.
    Cells inside the band itself are ignored (they go with it)."""
    bad: list[str] = []
    for sheet, cell, f in formulas:
        if sheet == target and _in_band(cell, rows, at, count):
            continue
        try:
            shift_formula(f, own_sheet=sheet, target=target, rows=rows, at=at, count=count,
                          delete=True)
        except _Ref:
            bad.append(f"{sheet}!{cell}")
    return bad


def _in_band(cell: str, rows: bool, at: int, count: int) -> bool:
    m = re.match(r"^([A-Za-z]+)(\d+)$", cell)
    if not m:
        return False
    n = int(m.group(2)) if rows else column_index_from_string(m.group(1).upper())
    return at <= n < at + count


def apply_struct(wb: Any, op: Any) -> list[str]:
    """Apply one structure op to an openpyxl workbook. Returns conflicts (strings)."""
    m = op.meta or {}
    name = op.sheet or ""
    if name not in wb.sheetnames:
        return [f"there is no sheet {name!r}"]
    at, count = int(m.get("at", 0)), int(m.get("count", 0))
    if at < 1 or count < 1:
        return ["a row or column number is missing"]
    rows = op.op.endswith("_rows")
    delete = op.op.startswith("delete")
    ws = wb[name]
    # 1) Rewrite every formula in the workbook (positions are still the old ones).
    for sheet in wb.worksheets:
        for row in sheet.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith("="):
                    try:
                        c.value = shift_formula(c.value, own_sheet=sheet.title, target=name,
                                                rows=rows, at=at, count=count, delete=delete)
                    except _Ref:
                        if not (sheet.title == name and _in_band(c.coordinate, rows, at, count)):
                            return [f"{sheet.title}!{c.coordinate} uses the cells being deleted"]
    # 2) Move the cells.
    if rows:
        (ws.delete_rows if delete else ws.insert_rows)(at, count)
    else:
        (ws.delete_cols if delete else ws.insert_cols)(at, count)
    # 3) Undo of a delete: put the deleted cells back.
    for r, c, v, nf in m.get("cells", []) if not delete else []:
        if isinstance(v, dict) and "date" in v:
            from datetime import datetime

            v = datetime.fromisoformat(v["date"])
        cell = ws.cell(row=r, column=c, value=v)
        if nf:
            cell.number_format = nf
    return []


def band_snapshot(sheet: Any, *, rows: bool, at: int, count: int) -> list[list[Any]]:
    """What a deleted band needs to come back on undo (model Sheet cells)."""
    out: list[list[Any]] = []
    for (r, c), cell in sorted(sheet.cells.items()):
        n = r if rows else c
        if not (at <= n < at + count):
            continue
        v = cell.formula or cell.value
        if hasattr(v, "isoformat"):
            v = {"date": v.isoformat()}
        out.append([r, c, v, cell.number_format if cell.number_format != "General" else None])
    return out

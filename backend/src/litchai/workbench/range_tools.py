"""Range actions for Sage (plan v5, slice B): sort, find and replace, clear, copy or
move a range, number format and style on a range, column width, freeze panes,
filter, and drop-down lists (data validation).

Up to 20 actions in one step make ONE proposal, so "bold the header, freeze row 1,
sort by date and show column D in naira" costs one model step. Cell changes are
set_cell operations (exact undo); layout changes are one ``sheet_layout`` operation
that keeps the old layout for undo. Formulas that move follow Excel's copy rule:
relative references shift, $-anchored ones stay.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.formula import _TOKEN
from litchai.workbench.model import Sheet, Workbook, a1, parse_a1, to_number
from litchai.workbench.ops import OpBuilder, Operation

ACTIONS = ("sort", "find_replace", "clear", "copy", "move", "number_format", "style",
           "column_width", "freeze", "filter", "validation")
FORMATS = {"naira": '"₦"#,##0.00', "currency": '"₦"#,##0.00', "money": '"₦"#,##0.00',
           "number": "#,##0.00", "integer": "#,##0", "percent": "0.0%",
           "date": "dd/mm/yyyy", "text": "@", "general": "General"}
_TOTAL = re.compile(r"^\s*(grand\s+)?totals?\b", re.IGNORECASE)
_CELL = re.compile(r"(\$?)([A-Za-z]{1,3})(\$?)(\d+)$")


def _col_letter(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _col_num(letters: str) -> int:
    n = 0
    for ch in letters.upper():
        n = n * 26 + ord(ch) - 64
    return n


def offset_formula(formula: str, dr: int, dc: int) -> str:
    """Excel copy rule: shift relative row/column parts by (dr, dc)."""
    if not formula or (dr == 0 and dc == 0):
        return formula
    src = formula.removeprefix("=")
    out, pos = [], 0

    def shift(ref: str) -> str:
        sheet, _, cell = ref.rpartition("!")
        m = _CELL.match(cell)
        if not m:
            return ref
        cabs, col, rabs, row = m.groups()
        c = _col_num(col) + (0 if cabs else dc)
        r = int(row) + (0 if rabs else dr)
        if c < 1 or r < 1:
            raise ToolError(f"moving {formula} would point above row 1 or left of column A")
        return (sheet + "!" if sheet else "") + f"{cabs}{_col_letter(c)}{rabs}{r}"

    while pos < len(src):
        m = _TOKEN.match(src, pos)
        if not m:
            out.append(src[pos:])
            break
        text = m.group(0)
        if m.lastgroup == "ref":
            text = shift(text)
        elif m.lastgroup == "range":
            left, right = text.rsplit(":", 1)
            text = shift(left) + ":" + shift(right)
        out.append(text)
        pos = m.end()
    return "=" + "".join(out)


def _bounds(sh: Sheet, rng: str | None) -> tuple[int, int, int, int]:
    if not rng:
        if not sh.cells:
            raise ToolError(f"{sh.name} is empty")
        return 1, 1, sh.max_row, sh.max_col
    rng = rng.upper().replace("$", "").strip()
    if re.fullmatch(r"[A-Z]{1,3}:[A-Z]{1,3}", rng):  # whole columns, e.g. D:D
        a, b = rng.split(":")
        return 1, _col_num(a), max(sh.max_row, 1), _col_num(b)
    if re.fullmatch(r"\d+:\d+", rng):  # whole rows
        a, b = (int(x) for x in rng.split(":"))
        return a, 1, b, max(sh.max_col, 1)
    a, _, b = rng.partition(":")
    r0, c0 = parse_a1(a)
    r1, c1 = parse_a1(b or a)
    return min(r0, r1), min(c0, c1), max(r0, r1), max(c0, c1)


def _sheet(wb: Workbook, name: str | None) -> Sheet:
    if not name:
        return next(iter(wb.sheets.values()))
    for n, s in wb.sheets.items():
        if n.lower() == name.strip().lower():
            return s
    raise ToolError(f"there is no sheet {name!r} (sheets: {list(wb.sheets)})")


def _content(sh: Sheet, r: int, c: int) -> tuple[Any, str | None, str | None]:
    cell = sh.get(r, c)
    if cell is None:
        return None, None, None
    v = cell.value
    return v, cell.formula, cell.number_format


def _put(b: OpBuilder, sh: Sheet, r: int, c: int, value: Any, formula: str | None,
         nf: str | None, reason: str) -> None:
    old_v, old_f, _ = _content(sh, r, c)
    if old_f == formula and (formula or old_v == value):
        return
    b.set(sh.name, a1(r, c), value=None if formula else value, formula=formula,
          number_format=nf, reason=reason)


def _sort_key(v: Any) -> tuple[int, Any]:
    if v is None or v == "":
        return (2, 0)
    n = to_number(v) if not isinstance(v, (date, datetime)) else None
    if isinstance(v, (date, datetime)):
        return (0, v.toordinal() if isinstance(v, date) else 0)
    if n is not None:
        return (0, n)
    return (1, str(v).lower())


def _sort(b: OpBuilder, sh: Sheet, a: dict[str, Any], reason: str) -> str:
    r0, c0, r1, c1 = _bounds(sh, a.get("range"))
    by = str(a.get("by") or "").strip()
    head = a.get("header")
    if head is None:  # a text row above data is a header
        first = [sh.value(r0, c) for c in range(c0, c1 + 1)]
        head = all(isinstance(x, str) or x is None for x in first) and any(first)
    start = r0 + 1 if head else r0
    end = r1
    def is_total(r: int) -> bool:
        cells = [sh.get(r, c) for c in range(c0, c1 + 1)]
        return any(x is not None and (_TOTAL.match(str(x.value or "")) or (
            x.formula and re.match(r"=\s*SUM\(", x.formula, re.IGNORECASE))) for x in cells)

    while end > start and (is_total(end) or all(
            sh.value(end, c) in (None, "") for c in range(c0, c1 + 1))):
        end -= 1  # totals (and blank lines under the table) stay at the bottom
    col = None
    if re.fullmatch(r"[A-Za-z]{1,3}", by):
        col = _col_num(by)
    elif head:
        col = next((c for c in range(c0, c1 + 1)
                    if str(sh.value(r0, c) or "").strip().lower() == by.lower()), None)
    if col is None or not c0 <= col <= c1:
        raise ToolError("sort needs by = a column letter in the range, or a header name")
    rows = list(range(start, end + 1))
    keyed = sorted(rows, key=lambda r: _sort_key(sh.value(r, col)),
                   reverse=bool(a.get("descending")))
    if a.get("descending"):  # blanks last also when descending
        keyed = [r for r in keyed if sh.value(r, col) not in (None, "")] + \
                [r for r in keyed if sh.value(r, col) in (None, "")]
    snap = {(r, c): _content(sh, r, c) for r in rows for c in range(c0, c1 + 1)}
    for new_r, old_r in zip(rows, keyed, strict=True):
        for c in range(c0, c1 + 1):
            v, f, nf = snap[(old_r, c)]
            _put(b, sh, new_r, c, v, offset_formula(f, new_r - old_r, 0) if f else None, nf,
                 reason)
    return f"sort {sh.name}!{a1(start, c0)}:{a1(end, c1)} by {by}" + (
        " (descending)" if a.get("descending") else "")


def _find_replace(b: OpBuilder, sh: Sheet, a: dict[str, Any], reason: str) -> str:
    find = str(a.get("find") or "")
    if not find:
        raise ToolError("find_replace needs find")
    repl = str(a.get("replace") if a.get("replace") is not None else "")
    r0, c0, r1, c1 = _bounds(sh, a.get("range"))
    flags = 0 if a.get("match_case") else re.IGNORECASE
    pat = re.compile(("^" + re.escape(find) + "$") if a.get("whole_cell") else re.escape(find),
                     flags)
    n = 0
    for (r, c), cell in sorted(sh.cells.items()):
        if not (r0 <= r <= r1 and c0 <= c <= c1):
            continue
        if cell.formula:
            if not a.get("in_formulas"):
                continue
            new = pat.sub(repl, cell.formula)
            if new != cell.formula:
                b.set(sh.name, a1(r, c), formula=new, number_format=cell.number_format,
                      reason=reason)
                n += 1
        elif isinstance(cell.value, str) and pat.search(cell.value):
            new_v: Any = pat.sub(repl, cell.value)
            num = to_number(new_v) if a.get("whole_cell") else None
            b.set(sh.name, a1(r, c), value=num if num is not None else new_v,
                  number_format=cell.number_format, reason=reason)
            n += 1
    if not n:
        raise ToolError(f"{find!r} was not found on {sh.name}")
    return f"replace {find!r} with {repl!r} in {n} cell{'s' if n != 1 else ''} on {sh.name}"


def _clear(b: OpBuilder, sh: Sheet, a: dict[str, Any], reason: str) -> str:
    r0, c0, r1, c1 = _bounds(sh, a.get("range"))
    n = 0
    for (r, c), cell in sorted(sh.cells.items()):
        if r0 <= r <= r1 and c0 <= c <= c1 and (cell.value is not None or cell.formula):
            b.set(sh.name, a1(r, c), value=None, reason=reason)
            n += 1
    if not n:
        raise ToolError("the range is already empty")
    return f"clear {n} cell{'s' if n != 1 else ''} on {sh.name}"


def _copy(b: OpBuilder, wb: Workbook, sh: Sheet, a: dict[str, Any], reason: str,
          move: bool) -> str:
    r0, c0, r1, c1 = _bounds(sh, a.get("range"))
    to = str(a.get("to") or "")
    if not to:
        raise ToolError(f"{'move' if move else 'copy'} needs to = the top-left target cell")
    dest = _sheet(wb, a.get("to_sheet")) if a.get("to_sheet") else sh
    tr, tc = parse_a1(to.upper().replace("$", ""))
    dr, dc = tr - r0, tc - c0
    snap = {(r, c): _content(sh, r, c) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)}
    targets = set()
    for (r, c), (v, f, nf) in snap.items():
        if v is None and not f:
            continue
        targets.add((dest.name, r + dr, c + dc))
        nf_f = offset_formula(f, 0, 0) if (f and move) else (offset_formula(f, dr, dc) if f else None)
        b.set(dest.name, a1(r + dr, c + dc), value=None if nf_f else v, formula=nf_f,
              number_format=nf, reason=reason)
    if move:
        for (r, c), (v, f, _) in snap.items():
            if (v is not None or f) and (sh.name, r, c) not in targets:
                b.set(sh.name, a1(r, c), value=None, reason=reason)
    where = f"{dest.name}!{to.upper()}" if dest is not sh else to.upper()
    return f"{'move' if move else 'copy'} {sh.name}!{a1(r0, c0)}:{a1(r1, c1)} to {where}"


def _format(b: OpBuilder, sh: Sheet, a: dict[str, Any], reason: str, style: bool) -> str:
    from litchai.workbench.styles import StyleError, clean

    r0, c0, r1, c1 = _bounds(sh, a.get("range"))
    if style:
        try:
            st = clean(a.get("style") or {})
        except StyleError as exc:
            raise ToolError(str(exc)) from exc
        if not st:
            raise ToolError("style needs keys like b, bg, fc, ha, border")
    else:
        fmt = str(a.get("format") or "")
        fmt = FORMATS.get(fmt.lower(), fmt)
        if not fmt:
            raise ToolError(f"number_format needs format: {sorted(FORMATS)} or an Excel code")
    n = 0
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            v, f, nf = _content(sh, r, c)
            if v is None and not f and not style:
                continue
            b.set(sh.name, a1(r, c), value=None if f else v, formula=f,
                  number_format=nf if style else fmt, style=st if style else None, reason=reason)
            n += 1
    what = "style" if style else f"number format {fmt}"
    return f"{what} on {sh.name}!{a1(r0, c0)}:{a1(r1, c1)} ({n} cells)"


def range_actions(ctx: ToolContext, *, actions: list[dict[str, Any]],
                  workbook_id: str | None = None) -> ToolOutput:
    wb = ctx.workbook(workbook_id)
    b = OpBuilder(wb, "range_actions")
    done: list[str] = []
    layout: dict[str, dict[str, Any]] = {}
    for a in actions:
        act = str(a.get("action", "")).lower()
        if act not in ACTIONS:
            raise ToolError(f"action must be one of {ACTIONS}")
        sh = _sheet(wb, a.get("sheet"))
        reason = f"range_actions · {act}"
        if act == "sort":
            done.append(_sort(b, sh, a, reason))
        elif act == "find_replace":
            done.append(_find_replace(b, sh, a, reason))
        elif act == "clear":
            done.append(_clear(b, sh, a, reason))
        elif act in ("copy", "move"):
            done.append(_copy(b, wb, sh, a, reason, act == "move"))
        elif act in ("number_format", "style"):
            done.append(_format(b, sh, a, reason, act == "style"))
        else:
            lay = layout.setdefault(sh.name, {})
            if act == "column_width":
                cols = str(a.get("columns") or a.get("range") or "").upper().replace("$", "")
                width = to_number(a.get("width"))
                if not cols or not width or not 2 <= width <= 120:
                    raise ToolError("column_width needs columns like B:D and width 2 to 120")
                lo, _, hi = cols.partition(":")
                for c in range(_col_num(re.sub(r"\d", "", lo)), _col_num(re.sub(r"\d", "", hi or lo)) + 1):
                    lay.setdefault("widths", {})[_col_letter(c)] = width
                done.append(f"width {width:g} for columns {cols} on {sh.name}")
            elif act == "freeze":
                cell = str(a.get("cell") or "").upper() or None  # None unfreezes
                if cell:
                    parse_a1(cell)
                lay["freeze"] = cell
                done.append(f"freeze panes at {cell} on {sh.name}" if cell else f"unfreeze {sh.name}")
            elif act == "filter":
                r0, c0, r1, c1 = _bounds(sh, a.get("range"))
                lay["filter"] = None if a.get("off") else f"{a1(r0, c0)}:{a1(r1, c1)}"
                done.append(f"filter on {sh.name}" if lay["filter"] else f"remove filter on {sh.name}")
            elif act == "validation":
                items = [str(x).strip() for x in (a.get("items") or []) if str(x).strip()]
                rng = str(a.get("range") or "").upper()
                if not items or not rng or len(",".join(items)) > 250:
                    raise ToolError("validation needs range and items (a short list)")
                _bounds(sh, rng)
                lay.setdefault("validations", []).append({"range": rng, "items": items})
                done.append(f"drop-down list ({', '.join(items[:4])}) on {sh.name}!{rng}")
    for name, lay in layout.items():
        b._ops.append(Operation("sheet_layout", wb.id, sheet=name, meta=lay,
                                reason="range_actions · layout", tool="range_actions"))
    if not b.ops:
        raise ToolError("nothing to change")
    title = "; ".join(done)
    batch = finish_batch(ctx, b, (title[0].upper() + title[1:])[:140], title[:300])
    return ToolOutput(data={"done": done, "cells": sum(1 for o in b.ops if o.op == "set_cell")},
                      batch=batch, summary="Proposed: " + title + ".")

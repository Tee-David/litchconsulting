"""Progressive, deterministic profiling (``profile_workbook`` / ``profile_range``).

Level 1 — probe: sheets, dimensions, header row, column names + roles.
Level 2 — shape: per-column types, nulls, text-in-number cells, text dates.
Level 3 — stats: sum/min/max/mean, date span, duplicate rows, Benford's law.

Profiles replace raw rows in prompts: the model sees the shape and the totals,
never the whole sheet (and never more than a few masked sample rows).
"""
from __future__ import annotations

import math
from collections import Counter
from datetime import date, datetime
from typing import Any

from litchai.workbench.model import (
    Sheet,
    Workbook,
    a1,
    is_date,
    is_number,
    looks_like_text_date,
    parse_range,
    to_number,
)
from litchai.workbench.tables import Table, detect_table

# Benford first-digit expected proportions.
BENFORD = {d: math.log10(1 + 1 / d) for d in range(1, 10)}


def benford(values: list[float]) -> dict[str, Any] | None:
    """First-digit test (Nigrini MAD thresholds). Needs ≥ 50 values ≥ 10."""
    digits = []
    for v in values:
        v = abs(v)
        if v >= 10:
            digits.append(int(str(int(v))[0]))
    n = len(digits)
    if n < 50:
        return None
    counts = Counter(digits)
    observed = {d: counts.get(d, 0) / n for d in range(1, 10)}
    mad = sum(abs(observed[d] - BENFORD[d]) for d in range(1, 10)) / 9
    chi2 = sum((counts.get(d, 0) - n * BENFORD[d]) ** 2 / (n * BENFORD[d]) for d in range(1, 10))
    if mad < 0.006:
        verdict = "close conformity"
    elif mad < 0.012:
        verdict = "acceptable conformity"
    elif mad < 0.015:
        verdict = "marginal conformity"
    else:
        verdict = "nonconformity"
    return {
        "n": n, "mad": round(mad, 5), "chi2": round(chi2, 2), "verdict": verdict,
        "observed": {str(d): round(observed[d], 4) for d in range(1, 10)},
        "expected": {str(d): round(BENFORD[d], 4) for d in range(1, 10)},
    }


def _iso(v: Any) -> str:
    return v.isoformat() if isinstance(v, (date, datetime)) else str(v)


def profile_columns(sheet: Sheet, table: Table, level: int,
                    rows: tuple[int, int] | None = None) -> list[dict[str, Any]]:
    r0, r1 = rows or (table.first_row, table.last_row)
    out = []
    for col in table.columns:
        vals = [(r, sheet.value(r, col.index)) for r in range(r0, r1 + 1)]
        info: dict[str, Any] = {"letter": col.letter, "name": col.name, "role": col.role}
        if level >= 2:
            types = Counter()
            text_numbers: list[str] = []
            text_dates: list[str] = []
            nulls = 0
            for r, v in vals:
                if v is None or (isinstance(v, str) and not v.strip()):
                    nulls += 1
                elif is_number(v):
                    types["number"] += 1
                elif is_date(v):
                    types["date"] += 1
                elif isinstance(v, str):
                    if to_number(v) is not None:
                        types["text_number"] += 1
                        text_numbers.append(a1(r, col.index))
                    elif looks_like_text_date(v):
                        types["text_date"] += 1
                        text_dates.append(a1(r, col.index))
                    else:
                        types["text"] += 1
                else:
                    types[type(v).__name__] += 1
            dominant = types.most_common(1)[0][0] if types else "empty"
            info.update({
                "type": dominant, "types": dict(types), "nulls": nulls,
                "text_numbers": text_numbers[:20], "text_number_count": len(text_numbers),
                "text_dates": text_dates[:20], "text_date_count": len(text_dates),
            })
        if level >= 3:
            nums = [to_number(v) for _, v in vals]
            nums = [n for n in nums if n is not None]
            if nums and info.get("type") in ("number", "text_number"):
                info["stats"] = {
                    "count": len(nums), "sum": round(sum(nums), 2),
                    "min": min(nums), "max": max(nums),
                    "mean": round(sum(nums) / len(nums), 2),
                }
                b = benford(nums)
                if b:
                    info["benford"] = b
            dates = [v if isinstance(v, date) else None for _, v in vals]
            dates = [d.date() if isinstance(d, datetime) else d for d in dates if d is not None]
            if dates:
                info["date_span"] = {"from": min(dates).isoformat(), "to": max(dates).isoformat()}
            if info.get("type") == "text":
                distinct = Counter(str(v).strip() for _, v in vals if v is not None)
                info["distinct"] = len(distinct)
                info["top"] = [[k, n] for k, n in distinct.most_common(5)]
        out.append(info)
    return out


def duplicate_rows(sheet: Sheet, table: Table, r0: int | None = None,
                   r1: int | None = None) -> list[list[int]]:
    """Groups of row numbers whose table cells are identical (excluding blanks)."""
    seen: dict[tuple, list[int]] = {}
    for r in range(r0 or table.first_row, (r1 or table.last_row) + 1):
        key = tuple(_iso(sheet.value(r, c.index)) for c in table.columns
                    if c.role != "balance")
        if all(k == "None" for k in key):
            continue
        seen.setdefault(key, []).append(r)
    return [rows for rows in seen.values() if len(rows) > 1]


def profile_sheet(sheet: Sheet, level: int = 3) -> dict[str, Any]:
    table = detect_table(sheet)
    base: dict[str, Any] = {
        "sheet": sheet.name, "max_row": sheet.max_row, "max_col": sheet.max_col,
        "cells": len(sheet.cells), "formulas": sheet.formula_count(),
    }
    if table is None or not table.columns:
        base["table"] = None
        return base
    base["table"] = table.describe()
    if level >= 2:
        base["columns"] = profile_columns(sheet, table, level)
    if level >= 3:
        dups = duplicate_rows(sheet, table)
        base["duplicates"] = {"groups": len(dups), "rows": dups[:20]}
        amounts = [table.amount(sheet, r) for r in range(table.first_row, table.last_row + 1)]
        amounts = [a for a in amounts if a is not None]
        if amounts:
            base["totals"] = {
                "inflow": round(sum(a for a in amounts if a > 0), 2),
                "outflow": round(-sum(a for a in amounts if a < 0), 2),
                "net": round(sum(amounts), 2), "count": len(amounts),
            }
    return base


def profile_workbook(wb: Workbook, level: int = 3,
                     sheets: list[str] | None = None) -> dict[str, Any]:
    names = sheets or list(wb.sheets)
    return {
        "workbook_id": wb.id, "name": wb.name, "origin": wb.origin, "level": level,
        "sheet_names": list(wb.sheets),
        "sheets": [profile_sheet(wb.sheet(n), level) for n in names],
    }


def profile_range(wb: Workbook, sheet_name: str, ref: str, level: int = 3) -> dict[str, Any]:
    sheet = wb.sheet(sheet_name)
    r0, c0, r1, c1 = parse_range(ref)
    table = detect_table(sheet)
    if table is None:
        return {"sheet": sheet.name, "range": ref, "table": None}
    sub = Table(sheet.name, table.header_row, max(r0, table.first_row),
                min(r1, table.last_row),
                [c for c in table.columns if c0 <= c.index <= c1])
    if r0 > table.header_row:
        sub.first_row = r0
    return {
        "sheet": sheet.name, "range": ref, "rows": sub.n_rows,
        "columns": profile_columns(sheet, sub, level, (sub.first_row, sub.last_row)),
        "duplicates": duplicate_rows(sheet, sub, sub.first_row, sub.last_row)[:20],
    }


def profile_text(profile: dict[str, Any], max_cols: int = 14) -> str:
    """Compact text rendering of a workbook profile for a prompt."""
    lines = [(f"Workbook {profile['name']} (id {profile['workbook_id']}): "
             f"sheets {', '.join(profile['sheet_names'])}")]
    for s in profile["sheets"]:
        t = s.get("table")
        if not t:
            lines.append(f"- {s['sheet']}: {s['cells']} cells, no table found")
            continue
        lines.append(f"- {s['sheet']}: table {t['range']} ({t['rows']} rows, "
                     f"{s['formulas']} formulas)")
        for c in (s.get("columns") or t["columns"])[:max_cols]:
            bits = [f"{c['letter']} '{c['name']}'"]
            if c.get("role"):
                bits.append(f"role={c['role']}")
            if c.get("type"):
                bits.append(f"type={c['type']}")
            if c.get("nulls"):
                bits.append(f"nulls={c['nulls']}")
            if c.get("text_number_count"):
                bits.append(f"text-numbers={c['text_number_count']}")
            if c.get("text_date_count"):
                bits.append(f"text-dates={c['text_date_count']}")
            if c.get("stats"):
                st = c["stats"]
                bits.append(f"sum={st['sum']:,} min={st['min']:,} max={st['max']:,}")
            if c.get("date_span"):
                bits.append(f"{c['date_span']['from']}..{c['date_span']['to']}")
            if c.get("benford"):
                bits.append(f"benford={c['benford']['verdict']}")
            lines.append("    " + " ".join(bits))
        if s.get("totals"):
            tt = s["totals"]
            lines.append(f"    totals: in {tt['inflow']:,} out {tt['outflow']:,} net {tt['net']:,}")
        if s.get("duplicates", {}).get("groups"):
            lines.append(f"    duplicate row groups: {s['duplicates']['groups']}")
    return "\n".join(lines)

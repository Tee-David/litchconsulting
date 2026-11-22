"""Formula audit for Sage (research items, plan v5): trace a cell's precedents and
dependents, and goal seek.

``trace_formula`` (read) answers "where does this figure come from" and "what
uses this cell": the formula, each cell it reads with its value (to a depth), and
the cells on any sheet whose formulas read it. ``goal_seek`` (write) finds the input
value that makes a formula cell reach a target, by recomputing the chain in Python
(cached values are dropped, so every dependent formula is evaluated again), and
proposes that input as one cell change.
"""
from __future__ import annotations

import copy
from typing import Any

from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.formula import Evaluator, refs_used
from litchai.workbench.model import (
    Cell,
    Sheet,
    Workbook,
    a1,
    parse_a1,
    parse_range,
    qualify,
    to_number,
)
from litchai.workbench.ops import OpBuilder


def _sheet(wb: Workbook, name: str | None) -> Sheet:
    if not name:
        return next(iter(wb.sheets.values()))
    for n, s in wb.sheets.items():
        if n.lower() == name.strip().lower():
            return s
    raise ToolError(f"there is no sheet {name!r} (sheets: {list(wb.sheets)})")


def _split(ref: str, default: str) -> tuple[str, str]:
    if "!" in ref:
        s, _, cell = ref.rpartition("!")
        return (s[1:-1].replace("''", "'") if s.startswith("'") else s), cell.replace("$", "")
    return default, ref.replace("$", "")


def _covers(ref: str, sheet: str, own: str, r: int, c: int) -> bool:
    s, rng = _split(ref, own)
    if s.lower() != sheet.lower():
        return False
    if ":" in rng:
        r0, c0, r1, c1 = parse_range(rng)
        return r0 <= r <= r1 and c0 <= c <= c1
    return parse_a1(rng) == (r, c)


def trace_formula(ctx: ToolContext, *, cell: str, sheet: str | None = None,
                  depth: int = 2, workbook_id: str | None = None) -> ToolOutput:
    wb = ctx.workbook_for(workbook_id, [sheet, cell.split("!")[0].strip("'") if "!" in cell else None])
    sh = _sheet(wb, sheet)
    r, c = parse_a1(cell.upper().replace("$", ""))
    depth = max(1, min(depth, 4))

    def node(s_name: str, rr: int, cc: int, d: int) -> dict[str, Any]:
        cl = wb.sheets[s_name].get(rr, cc) if s_name in wb.sheets else None
        out: dict[str, Any] = {"cell": qualify(s_name, a1(rr, cc)),
                               "value": cl.display if cl else None}
        if cl and cl.formula:
            out["formula"] = cl.formula
            if d > 0:
                kids = []
                for ref in refs_used(cl.formula)[:12]:
                    s2, rng = _split(ref, s_name)
                    if ":" in rng:
                        r0, c0, r1, c1 = parse_range(rng)
                        kids.append({"range": qualify(s2, rng),
                                     "cells": (r1 - r0 + 1) * (c1 - c0 + 1)})
                    elif s2 in wb.sheets:
                        rr2, cc2 = parse_a1(rng)
                        kids.append(node(s2, rr2, cc2, d - 1))
                out["reads"] = kids
        return out

    tree = node(sh.name, r, c, depth)
    users = []
    for s in wb.sheets.values():
        for (rr, cc), cl in s.cells.items():
            if cl.formula and any(_covers(ref, sh.name, s.name, r, c) for ref in refs_used(cl.formula)):
                users.append(qualify(s.name, a1(rr, cc)))
    data = {"trace": tree, "used_by": users[:40], "used_by_count": len(users)}
    target = qualify(sh.name, a1(r, c))
    what = f"{target} = {tree.get('formula') or repr(tree.get('value'))}"
    return ToolOutput(data=data, citations=[target, *users[:10]],
                      summary=f"{what}; used by {len(users)} formula cell(s).")


def _fresh(model: Workbook) -> Workbook:
    """A copy whose formula cells all compute again (no cached results)."""
    m = copy.deepcopy(model)
    for s in m.sheets.values():
        for cl in s.cells.values():
            if cl.formula:
                cl.value = None
                cl.preview = None
    return m


def goal_seek(ctx: ToolContext, *, target_cell: str, target_value: float, changing_cell: str,
              sheet: str | None = None, changing_sheet: str | None = None,
              workbook_id: str | None = None) -> ToolOutput:
    wb = ctx.workbook_for(workbook_id, [sheet, changing_sheet])
    ts = _sheet(wb, sheet)
    cs = _sheet(wb, changing_sheet or ts.name)
    tr, tc = parse_a1(target_cell.upper().replace("$", ""))
    cr, cc = parse_a1(changing_cell.upper().replace("$", ""))
    tcell, ccell = ts.get(tr, tc), cs.get(cr, cc)
    if tcell is None or not tcell.formula:
        raise ToolError(f"{target_cell} must be a formula cell")
    if ccell is not None and ccell.formula:
        raise ToolError(f"{changing_cell} must be an input (a value), not a formula")
    base = _fresh(wb)
    start = to_number(ccell.value) if ccell else 0.0

    def f(x: float) -> float:
        m = copy.deepcopy(base)
        cl = m.sheets[cs.name].get(cr, cc)
        if cl is None:
            m.sheets[cs.name].set(cr, cc, Cell(value=x))
        else:
            cl.value = x
        v = to_number(Evaluator(m).cell(ts.name, tr, tc))
        if v is None:
            raise ToolError(f"{target_cell} does not give a number")
        return v - target_value

    # Secant from the current value, then bisection if it does not settle.
    x0 = float(start or 0.0)
    x1 = x0 * 1.1 + 1.0
    f0, f1 = f(x0), f(x1)
    x = x1
    for _ in range(60):
        if abs(f1) < 1e-6:
            break
        if f1 == f0:
            raise ToolError(f"{target_cell} does not change when {changing_cell} changes")
        x = x1 - f1 * (x1 - x0) / (f1 - f0)
        x0, f0, x1, f1 = x1, f1, x, f(x)
    if abs(f1) > max(0.01, abs(target_value) * 1e-9):
        raise ToolError("no input value reaches that target (the formula may not be linear "
                        "or may have no solution)")
    x = round(x1, 6)
    b = OpBuilder(wb, "goal_seek")
    b.set(cs.name, a1(cr, cc), value=round(x, 2) if abs(x - round(x, 2)) < 1e-6 else x,
          number_format=ccell.number_format if ccell else None,
          reason=f"goal seek: {qualify(ts.name, a1(tr, tc))} = {target_value:,.2f}")
    batch = finish_batch(ctx, b, f"Goal seek: set {cs.name}!{changing_cell.upper()}",
                         f"{target_cell.upper()} reaches {target_value:,.2f}")
    return ToolOutput(data={"changing_cell": qualify(cs.name, a1(cr, cc)), "value": x,
                            "was": start, "target": qualify(ts.name, a1(tr, tc)),
                            "target_value": target_value},
                      batch=batch, citations=[qualify(ts.name, a1(tr, tc))],
                      summary=(f"{changing_cell.upper()} = {x:,.2f} (was {start or 0:,.2f}) makes "
                               f"{target_cell.upper()} = {target_value:,.2f}."))


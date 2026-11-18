"""Sheet actions for Sage (plan v5, slice A): delete, rename, copy, move, hide, show,
colour, insert or delete rows and columns, merge and unmerge, remove a chart.

The same undoable operations as the grid's sheet menu, all in ONE proposal. The
engine resolves sets ("all the other sheets", "the sheets Sage made", "the empty
sheets"), so the model never lists names it may get wrong. Before a delete it finds
formulas on the sheets that stay which point at a deleted sheet: it refuses, unless
the request says to keep those figures as values (``values_first``) or to accept the
broken references. A sheet that Sage did not make (an uploaded file, or the person's
own) is named in the summary as source data; the write gate marks every delete risky.
"""
from __future__ import annotations

import re
from typing import Any

from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.model import Workbook, a1, parse_a1
from litchai.workbench.ops import OpBuilder, Operation, sheet_snapshot, unique_sheet_name

ACTIONS = ("delete", "rename", "copy", "move", "hide", "unhide", "color", "insert_rows",
           "delete_rows", "insert_cols", "delete_cols", "merge", "unmerge", "remove_chart")
SETS = ("all_except", "sage_made", "empty", "hidden")


def _ref_pattern(name: str) -> re.Pattern[str]:
    quoted = "'" + name.replace("'", "''") + "'"
    return re.compile(r"(?:" + re.escape(quoted) + r"|(?<![\w'.])" + re.escape(name) + r")!",
                      re.IGNORECASE)


def _find(wb: Workbook, name: str) -> str:
    for n in wb.sheets:
        if n.lower() == str(name).strip().lower():
            return n
    raise ToolError(f"there is no sheet {name!r} (sheets: {list(wb.sheets)})")


def _targets(wb: Workbook, a: dict[str, Any]) -> list[str]:
    if a.get("sheets"):
        return [_find(wb, n) for n in a["sheets"]]
    if a.get("sheet"):
        return [_find(wb, a["sheet"])]
    which = a.get("which")
    if which not in SETS:
        raise ToolError(f"name the sheet(s), or give which = one of {SETS}")
    keep = {_find(wb, n) for n in a.get("keep") or []}
    if which == "all_except":
        if not keep:
            raise ToolError("all_except needs keep = the sheet(s) to keep")
        out = [n for n in wb.sheets if n not in keep]
    elif which == "sage_made":
        out = [n for n, s in wb.sheets.items() if n in wb.generated or s.proposed]
    elif which == "empty":
        out = [n for n, s in wb.sheets.items() if not any(
            c.value not in (None, "") or c.formula for c in s.cells.values())]
    else:
        out = [n for n, s in wb.sheets.items() if s.hidden]
    return [n for n in out if n not in keep]


def sheet_actions(ctx: ToolContext, *, actions: list[dict[str, Any]],
                  workbook_id: str | None = None, values_first: bool = False,
                  allow_broken_refs: bool = False) -> ToolOutput:
    wb = ctx.workbook(workbook_id)
    b = OpBuilder(wb, "sheet_actions")
    ops: list[Operation] = []
    titles: list[str] = []
    notes: list[str] = []
    order = list(wb.sheets)
    deleting: list[str] = []
    for a in actions:
        act = str(a.get("action", "")).lower()
        if act not in ACTIONS:
            raise ToolError(f"action must be one of {ACTIONS}")
        names = _targets(wb, a)
        if not names:
            notes.append(f"{act}: no sheet matched")
            continue
        for name in names:
            sh = wb.sheets[name]
            if act == "delete":
                deleting.append(name)
            elif act == "rename":
                to = unique_sheet_name(Workbook(id="", name=""), str(a.get("name") or "").strip())
                if not str(a.get("name") or "").strip():
                    raise ToolError("rename needs name")
                if to.lower() != name.lower() and to.lower() in {x.lower() for x in wb.sheets}:
                    raise ToolError(f"a sheet named {to!r} already exists")
                ops.append(Operation("rename_sheet", wb.id, sheet=name, meta={"to": to}))
                titles.append(f"rename {name} to {to}")
            elif act == "copy":
                to = unique_sheet_name(wb, str(a.get("name") or f"{name} (copy)"))
                ops.append(Operation("copy_sheet", wb.id, sheet=name, meta={"to": to}))
                titles.append(f"copy {name} as {to}")
            elif act == "move":
                to_i = max(0, min(int(a.get("index") or 0), len(order) - 1))
                ops.append(Operation("move_sheet", wb.id, sheet=name,
                                     meta={"from": order.index(name), "to": to_i}))
                titles.append(f"move {name} to position {to_i + 1}")
            elif act in ("hide", "unhide"):
                ops.append(Operation("sheet_props", wb.id, sheet=name,
                                     meta={"hidden": act == "hide", "old_hidden": sh.hidden}))
                titles.append(f"{'hide' if act == 'hide' else 'show'} {name}")
            elif act == "color":
                col = str(a.get("color") or "").lstrip("#").upper()
                if col and not re.fullmatch(r"[0-9A-F]{6}", col):
                    raise ToolError("color must look like 1F3A8A")
                ops.append(Operation("sheet_props", wb.id, sheet=name,
                                     meta={"color": col or None, "old_color": sh.color}))
                titles.append(f"colour the {name} tab")
            elif act in ("insert_rows", "delete_rows", "insert_cols", "delete_cols"):
                ops.append(_band(wb, name, act, a))
                titles.append(f"{act.replace('_', ' ')} on {name}")
            elif act in ("merge", "unmerge"):
                ops.append(_merge(wb, name, act, str(a.get("range") or "")))
                titles.append(f"{act} {str(a.get('range')).upper()} on {name}")
            elif act == "remove_chart":
                title = a.get("chart_title")
                if not title:
                    raise ToolError("remove_chart needs chart_title")
                ops.append(Operation("remove_chart", wb.id, sheet=name, chart={"title": title}))
                titles.append(f"remove chart {title!r} from {name}")

    breaks: list[str] = []
    if deleting:
        deleting = list(dict.fromkeys(deleting))
        visible_left = [n for n, s in wb.sheets.items() if not s.hidden and n not in deleting]
        if not visible_left:
            raise ToolError("a workbook keeps at least one visible sheet: say which to keep")
        stays = [n for n in wb.sheets if n not in deleting]
        pats = {d: _ref_pattern(d) for d in deleting}
        for s_name in stays:
            for (r, c), cell in sorted(wb.sheets[s_name].cells.items()):
                if cell.formula and any(p.search(cell.formula) for p in pats.values()):
                    breaks.append(f"{s_name}!{a1(r, c)}")
                    if values_first:
                        v = cell.display
                        b.set(s_name, a1(r, c), value=v.isoformat() if hasattr(v, "isoformat") else v,
                              number_format=cell.number_format, reason="kept as a value before "
                              "the sheet it points at is deleted")
        if breaks and not (values_first or allow_broken_refs):
            more = f" and {len(breaks) - 6} more" if len(breaks) > 6 else ""
            raise ToolError(f"{len(breaks)} formula(s) on the sheets that stay point at a sheet "
                            f"to delete ({', '.join(breaks[:6])}{more}). Ask the person: keep "
                            "those figures as values (values_first=true), or delete anyway "
                            "(allow_broken_refs=true).")
        for d in deleting:
            ops.append(Operation("delete_sheet", wb.id, sheet=d,
                                 meta=sheet_snapshot(wb, d, order.index(d))))
        source = [d for d in deleting if d not in wb.generated and not wb.sheets[d].proposed]
        titles.insert(0, f"delete {', '.join(deleting)}")
        if source:
            notes.append(f"Source data (not made by Sage): {', '.join(source)}.")
        if breaks:
            notes.append(f"{len(breaks)} formula(s) pointed at them: "
                         + ("kept as values." if values_first else "they will show #REF!."))
    if not ops:
        raise ToolError("nothing to do: " + "; ".join(notes or ["no action matched"]))
    for op in ops:
        op.tool, op.reason = "sheet_actions", "sheet action"
    b._ops.extend(ops)
    title = "; ".join(titles)
    title = title[0].upper() + title[1:]
    batch = finish_batch(ctx, b, title[:140], " ".join(notes)[:300] or title[:300])
    data = {"workbook_id": wb.id, "done": titles, "deleted": deleting, "broken_refs": breaks[:20],
            "notes": notes, "sheets_after": [n for n in wb.sheets if n not in deleting]}
    return ToolOutput(data=data, batch=batch,
                      summary=f"Proposed: {title}." + (" " + " ".join(notes) if notes else ""))


def _band(wb: Workbook, name: str, act: str, a: dict[str, Any]) -> Operation:
    from litchai.workbench.structure import band_snapshot, broken_by_delete

    rows = act.endswith("_rows")
    at = a.get("at")
    if isinstance(at, str) and not at.isdigit():
        at = parse_a1(f"{at}1")[1] if not rows else None
    at, n = int(at or 0), int(a.get("count") or 1)
    if at < 1 or n < 1:
        raise ToolError(f"{act} needs at (first {'row' if rows else 'column'}, 1-based) and count")
    meta: dict[str, Any] = {"at": at, "count": n}
    if act.startswith("delete"):
        formulas = [(s.name, a1(r, c), cell.formula) for s in wb.sheets.values()
                    for (r, c), cell in s.cells.items() if cell.formula]
        bad = broken_by_delete(formulas, target=name, rows=rows, at=at, count=n)
        if bad:
            raise ToolError(f"{', '.join(bad[:4])} use these {'rows' if rows else 'columns'}; "
                            "change those formulas first")
        meta["cells"] = band_snapshot(wb.sheets[name], rows=rows, at=at, count=n)
    return Operation(act, wb.id, sheet=name, meta=meta)


def _merge(wb: Workbook, name: str, act: str, rng: str) -> Operation:
    rng = rng.upper().replace("$", "")
    if ":" not in rng:
        raise ToolError("merge needs a range like A1:D1")
    (ra, ca), (rb, cb) = (parse_a1(x) for x in rng.split(":"))
    sh = wb.sheets[name]
    if act == "unmerge" and rng not in sh.merged:
        raise ToolError(f"{rng} is not merged")
    hidden = []
    if act == "merge":
        for (r, c), cell in sorted(sh.cells.items()):
            if ra <= r <= rb and ca <= c <= cb and (r, c) != (ra, ca) and (
                    cell.value is not None or cell.formula):
                v = cell.formula or cell.value
                hidden.append([r, c, {"date": v.isoformat()} if hasattr(v, "isoformat") else v,
                               cell.number_format if cell.number_format != "General" else None])
    return Operation("merge_cells" if act == "merge" else "unmerge_cells", wb.id, sheet=name,
                     meta={"range": rng, "cells": hidden})

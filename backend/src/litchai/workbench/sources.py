"""Sources and the working book (workbench v8, plans/workbench-v8-flow.md).

A workbench has two parts that never mix:

- **Sources**: the files the person gave (spreadsheets, CSVs, PDFs, scans, letters).
  They are never changed. Tools read them and cite them.
- **The working book**: the sheets the person and Sage make. Every proposal is written
  here.

When a write tool builds its proposal on a source (for example statements next to a
trial balance), the proposal is moved to the working book. The source sheets that the
proposal changes or that its formulas read are brought in first as read-only copies
("import_sheet"), so live formulas such as ='Trial balance'!C5 still work and the
download is one self-contained workbook.

Tools that scan "every sheet" must not count an imported copy twice (a TB found in
the source and in the working book). So the tools see the working book through a
*view* that hides the imported copies; only the proposal step uses the full book.
"""
from __future__ import annotations

import copy
import re
from dataclasses import replace
from typing import Any

from litchai.workbench.model import Cell, Sheet, Workbook, a1, parse_a1
from litchai.workbench.ops import Operation

WORK_NAME = "Working book"
IMPORT = "import_sheet"


def view_of(work: Workbook, imported: set[str]) -> Workbook:
    """The working book without its imported source copies (shares the Sheet objects)."""
    return replace(work, sheets={k: v for k, v in work.sheets.items() if k not in imported})


def views(full: dict[str, Workbook], work_id: str | None, imports: dict[str, Any],
          enriched: set[str]) -> dict[str, Workbook]:
    """What the tools see. An imported copy that Sage has not changed stays hidden (the
    source is read instead). A copy that Sage changed (a Category column added, say) is
    shown, and its source sheet is hidden, so nothing is counted twice."""
    out = dict(full)
    if not work_id or work_id not in full:
        return out
    hide_work = {k for k in imports if k not in enriched}
    out[work_id] = view_of(full[work_id], hide_work)
    hide_src: dict[str, set[str]] = {}
    for k in enriched:
        m = imports.get(k) or {}
        if m.get("from") in full:
            hide_src.setdefault(str(m["from"]), set()).add(str(m.get("sheet")))
    for sid, names in hide_src.items():
        out[sid] = view_of(full[sid], names)
    return out


def refers_to(formula: str | None, sheet: str) -> bool:
    if not formula:
        return False
    if f"'{sheet}'!" in formula or f"'{sheet.replace(chr(39), chr(39) * 2)}'!" in formula:
        return True
    return bool(re.search(rf"(?<![\w'.]){re.escape(sheet)}!", formula))


def _rename_in(formula: str | None, old: str, new: str) -> str | None:
    if not formula:
        return formula
    q = "'" + new.replace("'", "''") + "'!"
    formula = formula.replace(f"'{old}'!", q)
    return re.sub(rf"(?<![\w'.]){re.escape(old)}!", q, formula)


def expand_imports(ops: list[Operation], models: dict[str, Workbook],
                   existing: set[str] | None = None) -> list[Operation]:
    """Replace each import_sheet op by create_sheet plus one set_cell per source cell
    (value or formula, number format and style). Ops of other kinds pass through. A copy
    whose sheet is already in ``existing`` is skipped (a copy is brought in once)."""
    out: list[Operation] = []
    for op in ops:
        if op.op != IMPORT:
            out.append(op)
            continue
        if existing and op.sheet in existing:
            continue
        m = op.meta or {}
        src = models.get(str(m.get("from")))
        if src is None or m.get("sheet") not in src.sheets:
            continue  # the source left the job: nothing to bring in
        sh = src.sheets[str(m["sheet"])]
        out.append(Operation("create_sheet", op.workbook_id, sheet=op.sheet, reason=op.reason,
                             tool=op.tool))
        for (r, c), cell in sorted(sh.cells.items()):
            if cell.value is None and not cell.formula and not cell.style and not cell.number_format:
                continue
            out.append(Operation("set_cell", op.workbook_id, sheet=op.sheet, cell=a1(r, c),
                                 new_value=None if cell.formula else cell.value,
                                 new_formula=cell.formula, number_format=cell.number_format,
                                 style=copy.deepcopy(cell.style) if cell.style else None,
                                 reason=op.reason, tool=op.tool, kind="new"))
    return out


def import_sheet_now(work: Workbook, src: Workbook, sheet: str, as_name: str) -> None:
    """Copy a source sheet into a model at once (for previews and the live context)."""
    s = src.sheets[sheet]
    work.sheets[as_name] = Sheet(as_name, cells={k: Cell(v.value, v.formula, v.preview,
                                                         v.number_format, copy.deepcopy(v.style))
                                                 for k, v in s.cells.items()},
                                 source_pages=dict(s.source_pages), merged=list(s.merged))


def redirect(ops: list[Operation], src: Workbook, work: Workbook, work_id: str,
             imports: dict[str, dict[str, str]], tool: str,
             pending: set[str] | None = None) -> list[Operation]:
    """Move a proposal built on a source into the working book.

    ``imports`` maps a working-book sheet to {"from": source id, "sheet": name}; it is
    updated with any new import. Returns the new op list: the imports first, then the
    original ops re-targeted (sheet names renamed when they would clash)."""
    created = {op.sheet for op in ops if op.op == "create_sheet" and op.sheet}
    needed: list[str] = []
    for name in src.sheets:
        if name in created:
            continue
        touched = any(op.sheet == name for op in ops)
        read = any(refers_to(op.new_formula, name) for op in ops)
        if touched or read:
            needed.append(name)
    rename: dict[str, str] = {}
    new_ops: list[Operation] = []
    for name in needed:
        # already brought in from the same source: reuse it
        have = next((k for k, v in imports.items()
                     if v.get("from") == src.id and v.get("sheet") == name), None)
        if have:
            if have != name:
                rename[name] = have
            if have in (pending or set()):
                # brought in by another proposal that is not accepted yet: this proposal
                # carries its own copy too (that one may be replaced or rejected)
                new_ops.append(Operation(IMPORT, work_id, sheet=have, tool=tool,
                                         meta={"from": src.id, "sheet": name},
                                         reason=f"Brings in {name} from {src.name} (read-only copy)"))
            continue
        target = name
        if target in work.sheets:
            base = f"{name} ({src.name.rsplit('.', 1)[0][:20]})"
            target, n = base[:31], 2
            while target in work.sheets:
                target, n = f"{base[:28]} {n}", n + 1
        if target != name:
            rename[name] = target
        imports[target] = {"from": src.id, "sheet": name}
        new_ops.append(Operation(IMPORT, work_id, sheet=target, tool=tool,
                                 meta={"from": src.id, "sheet": name},
                                 reason=f"Brings in {name} from {src.name} (read-only copy)"))
    # A sheet the proposal creates that already exists in the working book: a sheet
    # Sage made (accepted) is rebuilt in place; any other sheet keeps its name and the
    # new one gets the next free name ("Recon 2").
    rebuild: set[str] = set()
    for name in created:
        have = work.sheets.get(name)
        if have is None or have.proposed:
            continue
        if name in work.generated and name not in imports:
            rebuild.add(name)
        else:
            n, target = 2, f"{name} 2"
            while target in work.sheets:
                n, target = n + 1, f"{name} {n + 1}"
            rename[name] = target
    written: set[tuple[str, str]] = set()
    for op in ops:
        if op.op == "create_sheet" and op.sheet in rebuild:
            continue
        o = copy.copy(op)
        o.workbook_id = work_id
        if o.sheet in rename:
            o.sheet = rename[o.sheet]
        for old, new in rename.items():
            o.new_formula = _rename_in(o.new_formula, old, new)
        if o.op == "set_cell" and o.sheet in rebuild:
            cur = work.sheets[o.sheet].get(*parse_a1(o.cell or "A1"))
            o.old_value = cur.value if cur else None
            o.old_formula = cur.formula if cur else None
            o.kind = "changed" if cur and (cur.value is not None or cur.formula) else "new"
            written.add((o.sheet, (o.cell or "").upper()))
        new_ops.append(o)
    for name in sorted(rebuild):  # clear what the new version no longer writes
        for (r, c), cur in sorted(work.sheets[name].cells.items()):
            if (name, a1(r, c)) in written or (cur.value is None and not cur.formula):
                continue
            new_ops.append(Operation("set_cell", work_id, sheet=name, cell=a1(r, c),
                                     old_value=cur.value, old_formula=cur.formula,
                                     new_value=None, new_formula=None, tool=tool, kind="changed",
                                     reason="cleared: not in the new version of this sheet"))
    return new_ops


def source_ids(refs: list[Any]) -> set[str]:
    return {r.id for r in refs if getattr(r, "kind", "source") == "source"}


def work_ref(refs: list[Any]) -> Any | None:
    return next((r for r in refs if getattr(r, "kind", "source") == "work"), None)


def work_id_of(conv: Any) -> str | None:
    """The working book's id: accepted, else proposed by a pending batch."""
    w = work_ref(conv.workbooks)
    if w is not None:
        return w.id
    return next((op.workbook_id for b in conv.batches if b.status == "pending" for op in b.ops
                 if op.op == "create_workbook" and (op.meta or {}).get("kind") == "work"), None)


def summary_line(refs: list[Any], models: dict[str, Workbook]) -> str:
    """One line on the working book for the agent prompt."""
    w = work_ref(refs)
    if w is None:
        return "Working book: none yet (it is made by the first output you propose)."
    m = models.get(w.id)
    own = [s for s in (m.sheets if m else []) if s not in (w.imports or {})]
    return f"Working book {w.id}: sheets {', '.join(own) or 'none yet'}."

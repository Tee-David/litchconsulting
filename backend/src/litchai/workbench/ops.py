"""Operation logs (Phase 3.7) — every AI write is a proposal, never a file edit.

A write tool returns a :class:`Batch` of :class:`Operation` rows (sheet, cell,
old, new, formula, reason, tool, source rows). Nothing touches the workbook
until a human accepts the batch; then :func:`apply_batch` replays it with
openpyxl onto the current version and the LibreOffice recompute gate checks
the result. If the gate finds an error token the new version is refused.
Undo is per batch: :func:`inverse_batch` swaps old/new (and turns a created
sheet into a removal), applied the same way.

Conflicts: when a cell's current content no longer matches the recorded ``old``
(someone changed it after the proposal), apply refuses rather than clobbering.
"""
from __future__ import annotations

import io
import shutil
import tempfile
import uuid
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from litchai.workbench.model import Cell, Sheet, Workbook, parse_a1

OP_KINDS = ("set_cell", "create_sheet", "delete_sheet", "create_workbook", "add_chart",
            "remove_chart")


@dataclass
class Operation:
    op: str
    workbook_id: str
    sheet: str | None = None
    cell: str | None = None
    old_value: Any = None
    old_formula: str | None = None
    new_value: Any = None
    new_formula: str | None = None
    number_format: str | None = None
    reason: str = ""
    tool: str = ""
    source_rows: list[str] = field(default_factory=list)   # qualified refs it was derived from
    preview_value: Any = None                               # Python-computed result
    chart: dict[str, Any] | None = None
    kind: str | None = None                                  # 'new' | 'changed' (diff colour)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        for k in ("old_value", "new_value", "preview_value"):
            v = d[k]
            if hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Operation:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Batch:
    id: str
    title: str
    summary: str
    tool: str
    ops: list[Operation]
    status: str = "pending"          # pending | accepted | rejected | undone | blocked
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    decided_at: str | None = None
    gate: dict[str, Any] | None = None
    inverse_of: str | None = None
    step: int | None = None

    def counts(self) -> dict[str, int]:
        new = sum(1 for o in self.ops if o.op == "set_cell" and o.kind == "new")
        changed = sum(1 for o in self.ops if o.op == "set_cell" and o.kind == "changed")
        sheets = sum(1 for o in self.ops if o.op == "create_sheet")
        charts = sum(1 for o in self.ops if o.op == "add_chart")
        return {"new_cells": new, "changed_cells": changed, "new_sheets": sheets,
                "charts": charts, "ops": len(self.ops)}

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "title": self.title, "summary": self.summary, "tool": self.tool,
            "status": self.status, "created_at": self.created_at, "decided_at": self.decided_at,
            "gate": self.gate, "inverse_of": self.inverse_of, "step": self.step,
            "counts": self.counts(), "ops": [o.to_dict() for o in self.ops],
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Batch:
        return cls(
            id=d["id"], title=d["title"], summary=d.get("summary", ""), tool=d.get("tool", ""),
            ops=[Operation.from_dict(o) for o in d.get("ops", [])],
            status=d.get("status", "pending"), created_at=d.get("created_at", ""),
            decided_at=d.get("decided_at"), gate=d.get("gate"),
            inverse_of=d.get("inverse_of"), step=d.get("step"),
        )


def new_batch(title: str, summary: str, tool: str, ops: list[Operation]) -> Batch:
    return Batch(id=f"b-{uuid.uuid4().hex[:10]}", title=title, summary=summary, tool=tool,
                 ops=ops)


class OpBuilder:
    """Builds set-cell operations against the *current* model so ``old`` is
    recorded and the diff colour (new vs changed) is right."""

    def __init__(self, model: Workbook, tool: str) -> None:
        self.model = model
        self.tool = tool
        self.ops: list[Operation] = []
        self._new_sheets: set[str] = set()

    def create_sheet(self, name: str, reason: str) -> str:
        name = unique_sheet_name(self.model, name, self._new_sheets)
        self._new_sheets.add(name)
        self.ops.append(Operation("create_sheet", self.model.id, sheet=name, reason=reason,
                                  tool=self.tool, kind="new"))
        return name

    def set(self, sheet: str, cell: str, *, value: Any = None, formula: str | None = None,
            reason: str = "", source_rows: list[str] | None = None, preview: Any = None,
            number_format: str | None = None) -> Operation:
        old_v = old_f = None
        if sheet in self.model.sheets:
            r, c = parse_a1(cell)
            cur = self.model.sheets[sheet].get(r, c)
            if cur is not None:
                old_v, old_f = cur.value, cur.formula
        if formula is not None and not formula.startswith("="):
            formula = "=" + formula
        op = Operation(
            "set_cell", self.model.id, sheet=sheet, cell=cell, old_value=old_v,
            old_formula=old_f, new_value=None if formula else value, new_formula=formula,
            number_format=number_format, reason=reason, tool=self.tool,
            source_rows=list(source_rows or []), preview_value=preview,
            kind="changed" if (old_v is not None or old_f is not None) else "new",
        )
        self.ops.append(op)
        return op

    def chart(self, sheet: str, spec: dict[str, Any], reason: str) -> Operation:
        op = Operation("add_chart", self.model.id, sheet=sheet, cell=spec.get("anchor"),
                       chart=spec, reason=reason, tool=self.tool, kind="new")
        self.ops.append(op)
        return op


def unique_sheet_name(model: Workbook, name: str, extra: set[str] | None = None) -> str:
    base = (name or "Sheet").replace("/", "-").replace("\\", "-").replace("?", "")
    for ch in "*[]:":
        base = base.replace(ch, "")
    base = base[:31] or "Sheet"
    taken = {s.lower() for s in model.sheets} | {s.lower() for s in (extra or set())}
    if base.lower() not in taken:
        return base
    n = 2
    while f"{base[:28]} {n}".lower() in taken:
        n += 1
    return f"{base[:28]} {n}"


# --- overlay: let later steps see pending proposals -------------------------------
def overlay(model: Workbook, ops: list[Operation]) -> None:
    """Apply ops to the in-memory model only (never the file)."""
    for op in ops:
        if op.workbook_id != model.id:
            continue
        if op.op == "create_sheet" and op.sheet and op.sheet not in model.sheets:
            model.sheets[op.sheet] = Sheet(op.sheet)
        elif op.op == "delete_sheet" and op.sheet:
            model.sheets.pop(op.sheet, None)
        elif op.op == "set_cell" and op.sheet and op.cell:
            sheet = model.sheets.setdefault(op.sheet, Sheet(op.sheet))
            r, c = parse_a1(op.cell)
            if op.new_formula is None and op.new_value is None:
                sheet.cells.pop((r, c), None)
            else:
                sheet.set(r, c, Cell(value=None if op.new_formula else op.new_value,
                                     formula=op.new_formula, preview=op.preview_value,
                                     number_format=op.number_format))


# --- apply ------------------------------------------------------------------------
class ApplyConflict(RuntimeError):
    def __init__(self, conflicts: list[str]) -> None:
        super().__init__("; ".join(conflicts[:5]))
        self.conflicts = conflicts


def _same(a: Any, b: Any) -> bool:
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(float(a) - float(b)) < 1e-9
    if hasattr(a, "isoformat") and hasattr(b, "isoformat"):
        return str(a)[:10] == str(b)[:10]
    return str(a) == str(b)


def apply_ops(xlsx: bytes, ops: list[Operation], *, check_conflicts: bool = True) -> bytes:
    """Replay ``ops`` onto the workbook bytes and return the new bytes."""
    wb = load_workbook(io.BytesIO(xlsx))
    conflicts: list[str] = []
    for op in ops:
        if op.op == "create_sheet":
            if op.sheet in wb.sheetnames:
                conflicts.append(f"sheet {op.sheet!r} already exists")
                continue
            wb.create_sheet(op.sheet)
        elif op.op == "delete_sheet":
            if op.sheet in wb.sheetnames:
                if len(wb.sheetnames) == 1:
                    wb.create_sheet("Sheet1")
                del wb[op.sheet]
        elif op.op == "set_cell":
            if op.sheet not in wb.sheetnames:
                wb.create_sheet(op.sheet)
            ws = wb[op.sheet]
            c = ws[op.cell]
            if check_conflicts:
                cur = c.value
                expected = op.old_formula if op.old_formula else op.old_value
                if isinstance(cur, str) and cur.startswith("=") and op.old_formula:
                    ok = cur.replace(" ", "") == op.old_formula.replace(" ", "")
                else:
                    ok = _same(cur, expected)
                if not ok:
                    conflicts.append(f"{op.sheet}!{op.cell} changed since the proposal")
                    continue
            c.value = op.new_formula if op.new_formula else op.new_value
            if op.number_format:
                c.number_format = op.number_format
        elif op.op == "add_chart":
            from litchai.workbench.charts import insert_chart

            if op.sheet not in wb.sheetnames:
                wb.create_sheet(op.sheet)
            insert_chart(wb[op.sheet], op.chart or {})
        elif op.op == "remove_chart":
            if op.sheet in wb.sheetnames:
                ws = wb[op.sheet]
                title = (op.chart or {}).get("title")
                ws._charts = [ch for ch in ws._charts if _chart_title(ch) != title]
    if conflicts:
        raise ApplyConflict(conflicts)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _chart_title(chart: Any) -> str | None:
    try:
        return chart.title.tx.rich.p[0].r[0].t
    except Exception:  # noqa: BLE001
        return None


def inverse_ops(ops: list[Operation]) -> list[Operation]:
    inv: list[Operation] = []
    for op in reversed(ops):
        if op.op == "set_cell":
            inv.append(Operation(
                "set_cell", op.workbook_id, sheet=op.sheet, cell=op.cell,
                old_value=op.new_value, old_formula=op.new_formula,
                new_value=op.old_value, new_formula=op.old_formula,
                reason=f"undo: {op.reason}", tool=op.tool, kind="changed",
            ))
        elif op.op == "create_sheet":
            inv.append(Operation("delete_sheet", op.workbook_id, sheet=op.sheet,
                                 reason=f"undo: {op.reason}", tool=op.tool))
        elif op.op == "add_chart":
            inv.append(Operation("remove_chart", op.workbook_id, sheet=op.sheet,
                                 chart=op.chart, reason=f"undo: {op.reason}", tool=op.tool))
    # Cells on a sheet that the undo deletes don't need restoring.
    deleted = {o.sheet for o in inv if o.op == "delete_sheet"}
    return [o for o in inv if not (o.op in ("set_cell", "remove_chart") and o.sheet in deleted)]


def inverse_batch(batch: Batch) -> Batch:
    return Batch(id=f"b-{uuid.uuid4().hex[:10]}", title=f"Undo: {batch.title}",
                 summary=f"Reverses batch {batch.id}", tool=batch.tool,
                 ops=inverse_ops(batch.ops), status="pending", inverse_of=batch.id)


# --- recompute gate ------------------------------------------------------------------
@dataclass
class GateResult:
    status: str                      # passed | blocked | unverified
    errors: list[str] = field(default_factory=list)
    formulas: int = 0
    engine: str = "libreoffice"
    detail: str | None = None
    recomputed: bytes | None = None  # the recomputed copy (cached values filled in)

    def to_dict(self) -> dict[str, Any]:
        return {"status": self.status, "errors": self.errors, "formulas": self.formulas,
                "engine": self.engine, "detail": self.detail}


Gate = Callable[[bytes], GateResult]


def count_formulas(xlsx: bytes) -> int:
    wb = load_workbook(io.BytesIO(xlsx))
    return sum(1 for ws in wb.worksheets for row in ws.iter_rows() for c in row
               if isinstance(c.value, str) and c.value.startswith("="))


def libreoffice_gate(xlsx: bytes) -> GateResult:
    """Headless LibreOffice recompute; any error token blocks. Without
    ``soffice`` on PATH the result is ``unverified`` (never a silent pass)."""
    formulas = count_formulas(xlsx)
    if shutil.which("soffice") is None:
        return GateResult("unverified", formulas=formulas, detail="LibreOffice not installed")
    from litchai.validation.recompute import RecomputeError, find_workbook_errors

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "candidate.xlsx"
        path.write_bytes(xlsx)
        try:
            grids, recomputed = _recompute_keep(path)
        except (RecomputeError, OSError) as exc:
            return GateResult("unverified", formulas=formulas, detail=str(exc)[:200])
    errors = [f"{s}!{_col(c)}{r + 1}: {tok}" for (s, r, c, tok) in find_workbook_errors(grids)]
    return GateResult("blocked" if errors else "passed", errors=errors, formulas=formulas,
                      recomputed=recomputed)


def _col(c: int) -> str:
    from openpyxl.utils import get_column_letter

    return get_column_letter(c + 1)


def _recompute_keep(path: Path) -> tuple[dict[str, list[list[str]]], bytes | None]:
    from litchai.validation.recompute import recompute_workbook

    grids = recompute_workbook(path)
    return grids, None


def gate_and_apply(xlsx: bytes, ops: list[Operation], gate: Gate | None = None, *,
                   check_conflicts: bool = True) -> tuple[bytes, GateResult]:
    """Apply → gate. Returns the candidate bytes and the gate result; callers keep
    the previous version when the gate blocks."""
    candidate = apply_ops(xlsx, ops, check_conflicts=check_conflicts)
    result = (gate or libreoffice_gate)(candidate)
    return candidate, result

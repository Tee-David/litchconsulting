"""Shared state a tool runs against, and what a tool returns."""
from __future__ import annotations

import copy
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from litchai.workbench.formula import safe_preview
from litchai.workbench.model import Sheet, Workbook, new_workbook
from litchai.workbench.ops import Batch, OpBuilder, Operation, new_batch, overlay
from litchai.workbench.tables import Table, detect_table

# (normalized narration) -> (category_code, source, confidence)
Categoriser = Callable[[str], tuple[str, str | None, float]]


class ToolError(ValueError):
    """A tool refused its input; the message is shown to the model and the user."""


@dataclass
class ToolContext:
    workbooks: dict[str, Workbook]        # models with pending proposals overlaid
    client_name: str = "Client"
    period_label: str = ""
    taxonomy: Any = None
    categoriser: Categoriser | None = None
    new_workbook_seq: int = 0
    # (workbook_id, sheet) created by proposals — skipped when a tool picks its
    # own source sheet, so "reconcile" never treats the proposed P&L as a ledger.
    generated: set[tuple[str, str]] = field(default_factory=set)
    # Results earlier steps left for later ones in the same turn (e.g. the P&L
    # figures that tax_compute uses), so the model never retypes a figure.
    memory: dict[str, Any] = field(default_factory=dict)

    def workbook(self, workbook_id: str | None = None) -> Workbook:
        if not self.workbooks:
            raise ToolError("no workbook is open in this conversation")
        if workbook_id is None:
            return next(iter(self.workbooks.values()))
        if workbook_id in self.workbooks:
            return self.workbooks[workbook_id]
        for wb in self.workbooks.values():
            if wb.name.lower() == workbook_id.lower():
                return wb
        raise ToolError(f"no workbook {workbook_id!r} (open: {list(self.workbooks)})")

    def find_sheet(self, sheet: str | None, workbook_id: str | None = None,
                   prefer: Callable[[Table], bool] | None = None) -> tuple[Workbook, Sheet, Table]:
        """Locate a sheet by name across every open workbook; with no name, the
        first table matching ``prefer`` (or the largest table)."""
        books = [self.workbook(workbook_id)] if workbook_id else list(self.workbooks.values())
        if sheet:
            for wb in books:
                for name, sh in wb.sheets.items():
                    if name.lower() == sheet.lower():
                        t = detect_table(sh)
                        if t is None or not t.columns:
                            raise ToolError(f"sheet {name!r} has no table")
                        return wb, sh, t
            names = [f"{wb.name}:{n}" for wb in books for n in wb.sheets]
            raise ToolError(f"no sheet {sheet!r} (sheets: {names})")
        candidates = []
        for wb in books:
            for sh in wb.sheets.values():
                t = detect_table(sh)
                if t is not None and t.columns and t.n_rows > 0:
                    candidates.append((wb, sh, t))
        if prefer:
            preferred = [c for c in candidates if prefer(c[2])]
            if preferred:
                candidates = preferred
        if not candidates:
            raise ToolError("no sheet with a data table was found")
        return max(candidates, key=lambda c: c[2].n_rows)

    def add_new_workbook(self, name: str, sheet_names: list[str] | None = None) -> Workbook:
        self.new_workbook_seq += 1
        wb = new_workbook(f"new-{self.new_workbook_seq}", name, sheet_names or [])
        self.workbooks[wb.id] = wb
        return wb


@dataclass
class ToolOutput:
    data: dict[str, Any] = field(default_factory=dict)
    batch: Batch | None = None
    citations: list[str] = field(default_factory=list)
    summary: str = ""
    chart_preview: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "data": self.data, "summary": self.summary, "citations": self.citations,
            "batch": self.batch.to_dict() if self.batch else None,
            "chart_preview": self.chart_preview,
        }


def finish_batch(ctx: ToolContext, builder: OpBuilder, title: str, summary: str) -> Batch:
    """Compute preview values for every proposed formula (against a copy of the
    model with the proposal overlaid), overlay it on the live context so later
    steps see it, and wrap it as a pending batch."""
    model = builder.model
    trial = copy.deepcopy(model)
    overlay(trial, builder.ops)
    for op in builder.ops:
        if op.op == "set_cell" and op.new_formula and op.preview_value is None:
            op.preview_value = safe_preview(trial, op.sheet or "", op.new_formula)
            # feed the preview back so dependants evaluate without recursion limits
            from litchai.workbench.model import parse_a1

            r, c = parse_a1(op.cell or "A1")
            cell = trial.sheets[op.sheet or ""].get(r, c)
            if cell is not None:
                cell.preview = op.preview_value
    overlay(model, builder.ops)
    for op in builder.ops:  # carry previews into the live overlay too
        if op.op == "set_cell" and op.new_formula:
            from litchai.workbench.model import parse_a1

            r, c = parse_a1(op.cell or "A1")
            cell = model.sheets[op.sheet or ""].get(r, c)
            if cell is not None:
                cell.preview = op.preview_value
    return new_batch(title, summary, builder.tool, list(builder.ops))


def ops_of(batches: list[Batch]) -> list[Operation]:
    return [op for b in batches for op in b.ops]

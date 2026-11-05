"""Typed tool registry for the workbench harness (Phase 3.6).

Each tool has a pydantic argument model (its JSON schema is what the model sees
and what a tool call is validated against), a kind (``read`` returns data,
``write`` returns a pending operation batch — never a file edit), a short
description, and example utterances for the decision layer's router.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from litchai.workbench import analysis, builders
from litchai.workbench.charts import ChartError, preview, validate_spec
from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.ops import OpBuilder
from litchai.workbench.profile import profile_range, profile_text, profile_workbook
from litchai.workbench.sqlquery import SqlRejected, build_catalog, query_sql


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProfileWorkbookArgs(_Args):
    level: int = Field(3, ge=1, le=3, description="1 dims/headers, 2 types/nulls, 3 stats")
    workbook_id: str | None = None
    sheets: list[str] | None = None


class ProfileRangeArgs(_Args):
    sheet: str
    range: str = Field(description="A1 range, e.g. B2:F140")
    workbook_id: str | None = None


class QuerySqlArgs(_Args):
    sql: str = Field(description="One read-only SELECT over the sheet tables")


class CategoriseArgs(_Args):
    sheet: str | None = None
    workbook_id: str | None = None
    description_column: str | None = None
    header: str = "Category"
    only_blank: bool = True


class StatementArgs(_Args):
    kind: Literal["pnl", "bs", "cashflow"]
    sheet: str | None = Field(None, description="Source sheet; omitted = best match")
    workbook_id: str | None = None
    new_sheet_name: str | None = None
    period_label: str | None = None
    opening_cash: float | None = None
    category_column: str | None = None


class PivotArgs(_Args):
    rows_column: str
    sheet: str | None = None
    workbook_id: str | None = None
    value_column: str | None = None
    columns_column: str | None = None
    agg: Literal["sum", "count"] = "sum"
    new_sheet_name: str | None = None


class FormulaColumnArgs(_Args):
    kind: Literal["difference", "sum", "ratio", "percent_of_total", "running_total",
                  "vat_from_gross", "wht", "flag_over", "custom"]
    header: str
    sheet: str | None = None
    workbook_id: str | None = None
    columns: list[str] | None = None
    threshold: float | None = None
    wht_category: str = "consultancy"
    payee_type: Literal["corporate", "individual"] = "corporate"
    template: str | None = Field(None, description="custom only, e.g. =E{row}-D{row}")


class SeriesArg(_Args):
    name: str
    ref: str


class ChartArgs(_Args):
    type: Literal["column", "bar", "stacked", "line", "area", "pie"] = "column"
    title: str
    categories: str = Field(description="Qualified range of labels, e.g. 'P&L'!A2:A13")
    series: list[SeriesArg] = Field(min_length=1)
    sheet: str | None = Field(None, description="Sheet the chart is inserted into")
    anchor: str = "H2"
    workbook_id: str | None = None
    y_format: Literal["money", "number", "percent"] = "money"


class ReconcileArgs(_Args):
    bank_sheet: str | None = None
    ledger_sheet: str | None = None
    date_window_days: int = Field(3, ge=0, le=31)
    write: bool = True
    new_sheet_name: str = "Recon"
    balance_per_bank: float | None = None
    balance_per_books: float | None = None


class AnomalyArgs(_Args):
    sheet: str | None = None
    workbook_id: str | None = None
    round_threshold: float = 1_000_000
    z: float = 3.5


class TaxArgs(_Args):
    kind: Literal["cit", "vat", "wht", "paye"]
    inputs: dict[str, Any] = Field(default_factory=dict)
    write: bool = False
    new_sheet_name: str | None = None


class SheetArgs(_Args):
    name: str
    workbook_id: str | None = None
    title: str | None = None
    headers: list[str] | None = None
    rows: list[list[Any]] | None = None


class NewSheetSpec(_Args):
    name: str
    title: str | None = None
    headers: list[str] | None = None
    rows: list[list[Any]] | None = None


class WorkbookArgs(_Args):
    name: str
    sheets: list[NewSheetSpec] | None = None


@dataclass(frozen=True)
class WorkbenchTool:
    name: str
    kind: str                           # read | write
    description: str
    args: type[BaseModel]
    run: Callable[[ToolContext, BaseModel], ToolOutput]
    examples: tuple[str, ...] = ()
    risky: bool = False                 # writes that overwrite source data

    def schema(self) -> dict[str, Any]:
        return self.args.model_json_schema()

    def spec(self) -> dict[str, Any]:
        return {"name": self.name, "kind": self.kind, "description": self.description,
                "parameters": self.schema()}


def _profile(ctx: ToolContext, a: ProfileWorkbookArgs) -> ToolOutput:
    books = [ctx.workbook(a.workbook_id)] if a.workbook_id else list(ctx.workbooks.values())
    profiles = [profile_workbook(wb, a.level, a.sheets if a.workbook_id else None)
                for wb in books]
    return ToolOutput(data={"workbooks": profiles},
                      summary="\n".join(profile_text(p) for p in profiles))


def _profile_range(ctx: ToolContext, a: ProfileRangeArgs) -> ToolOutput:
    wb, sh, _ = ctx.find_sheet(a.sheet, a.workbook_id)
    p = profile_range(wb, sh.name, a.range)
    return ToolOutput(data=p, citations=[f"{sh.name}!{a.range}"],
                      summary=f"Profiled {sh.name}!{a.range} ({p.get('rows', 0)} rows)")


def _query(ctx: ToolContext, a: QuerySqlArgs) -> ToolOutput:
    try:
        res = query_sql(list(ctx.workbooks.values()), a.sql)
    except SqlRejected as exc:
        raise ToolError(str(exc)) from exc
    return ToolOutput(data=res, summary=f"{res['row_count']} rows"
                      + (" (truncated)" if res.get("truncated") else ""))


def _chart(ctx: ToolContext, a: ChartArgs) -> ToolOutput:
    wb = ctx.workbook(a.workbook_id)
    spec = a.model_dump()
    spec["series"] = [s.model_dump() for s in a.series]
    try:
        clean = validate_spec(wb, spec)
        pv = preview(wb, clean)
    except (ChartError, KeyError, ValueError) as exc:
        raise ToolError(str(exc)) from exc
    b = OpBuilder(wb, "add_chart")
    b.chart(clean["sheet"], clean, f"{clean['type']} chart '{clean['title']}'")
    batch = finish_batch(ctx, b, f"Insert chart: {clean['title']}",
                         f"{clean['sheet']}!{clean['anchor']} · linked to "
                         f"{len(clean['series'])} series")
    return ToolOutput(data={"spec": clean}, batch=batch, chart_preview=pv,
                      citations=[s["ref"] for s in clean["series"]],
                      summary=f"Chart '{clean['title']}' proposed.")


def _kw(a: BaseModel) -> dict[str, Any]:
    return a.model_dump()


TOOLS: tuple[WorkbenchTool, ...] = (
    WorkbenchTool("profile_workbook", "read",
                  "Profile every sheet: dimensions, headers, column roles, types, nulls, "
                  "totals, date span, duplicates, Benford.", ProfileWorkbookArgs, _profile,
                  ("what is in this file", "summarise the workbook", "first look")),
    WorkbenchTool("profile_range", "read", "Profile one range of one sheet.", ProfileRangeArgs,
                  _profile_range, ("describe B2:F140", "what's in this range")),
    WorkbenchTool("query_sql", "read",
                  "Run ONE read-only SQL SELECT (DuckDB) over the sheet tables. "
                  "Use for totals, counts, filters and group-bys.", QuerySqlArgs, _query,
                  ("total revenue by month", "how many transactions over 1m",
                   "sum of bank charges")),
    WorkbenchTool("categorise_rows", "write",
                  "Add/fill a Category column using the firm's categorisation ladder.",
                  CategoriseArgs, lambda c, a: builders.categorise_rows(c, **_kw(a)),
                  ("categorise the transactions", "classify each row", "add categories")),
    WorkbenchTool("build_statement", "write",
                  "Build a P&L (pnl), balance sheet (bs) or cash-flow statement (cashflow) as "
                  "a new sheet whose lines are SUMIFS links to the categorised source.",
                  StatementArgs, lambda c, a: builders.build_statement(c, **_kw(a)),
                  ("build a p&l", "make the income statement", "prepare a cash flow",
                   "draft the balance sheet")),
    WorkbenchTool("pivot", "write",
                  "Summarise a sheet by one column (optionally across another) as a "
                  "SUMIFS/COUNTIFS formula table on a new sheet.", PivotArgs,
                  lambda c, a: builders.pivot(c, **_kw(a)),
                  ("totals by category", "pivot by month", "summary by vendor")),
    WorkbenchTool("add_formula_column", "write",
                  "Add a computed column: difference, sum, ratio, percent_of_total, "
                  "running_total, vat_from_gross, wht, flag_over, or a validated custom "
                  "template like =E{row}-D{row}.", FormulaColumnArgs,
                  lambda c, a: builders.add_formula_column(c, **_kw(a)),
                  ("add a net column", "compute vat on each line", "flag amounts over 5m")),
    WorkbenchTool("add_chart", "write",
                  "Propose a native Excel chart linked to ranges; returns a JSON preview.",
                  ChartArgs, _chart, ("chart revenue against costs", "plot monthly totals")),
    WorkbenchTool("reconcile", "write",
                  "Match bank lines to ledger lines and lay out a bank reconciliation.",
                  ReconcileArgs, lambda c, a: analysis.reconcile(c, **_kw(a)),
                  ("reconcile bank to ledger", "bank reconciliation",
                   "why don't bank and books agree")),
    WorkbenchTool("flag_anomalies", "read",
                  "Find duplicates, outliers, round amounts, weekend postings, text numbers/"
                  "dates, balance breaks and Benford issues across sheets.", AnomalyArgs,
                  lambda c, a: analysis.flag_anomalies(c, **_kw(a)),
                  ("anything unusual", "find duplicates", "check for anomalies")),
    WorkbenchTool("tax_compute", "read",
                  "Compute CIT, VAT, WHT or PAYE from the shared tax config; write=true lays "
                  "the computation out as a new sheet (that becomes a proposal).", TaxArgs,
                  lambda c, a: analysis.tax_compute(c, **_kw(a)),
                  ("what is the cit", "compute vat payable", "paye for this salary",
                   "withholding tax on this invoice")),
    WorkbenchTool("create_sheet", "write", "Create a new sheet with optional headers/rows.",
                  SheetArgs, lambda c, a: builders.create_sheet(c, **_kw(a)),
                  ("add a new sheet", "make a schedule tab")),
    WorkbenchTool("create_workbook", "write", "Create a new workbook with one or more sheets.",
                  WorkbookArgs,
                  lambda c, a: builders.create_workbook(
                      c, name=a.name, sheets=[s.model_dump() for s in (a.sheets or [])]),
                  ("new blank workbook", "build a template from scratch")),
)

TOOLS_BY_NAME = {t.name: t for t in TOOLS}


def validate_call(name: str, args: dict[str, Any] | None) -> tuple[WorkbenchTool, BaseModel]:
    tool = TOOLS_BY_NAME.get(name)
    if tool is None:
        raise ToolError(f"unknown tool {name!r} (tools: {sorted(TOOLS_BY_NAME)})")
    try:
        return tool, tool.args.model_validate(args or {})
    except ValidationError as exc:
        msgs = "; ".join(f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}"
                         for e in exc.errors()[:5])
        raise ToolError(f"invalid arguments for {name}: {msgs}") from exc


def run_tool(ctx: ToolContext, name: str, args: dict[str, Any] | None) -> ToolOutput:
    tool, parsed = validate_call(name, args)
    out = tool.run(ctx, parsed)
    if out.batch is not None:
        out.batch.tool = tool.name
    return out


def catalog_text(ctx: ToolContext) -> str:
    cat, _ = build_catalog(list(ctx.workbooks.values()))
    return cat.describe()

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

from litchai.workbench import analysis, builders, compiler_tools, trial_balance
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


class CleanArgs(_Args):
    sheet: str | None = None
    workbook_id: str | None = None
    kinds: list[Literal["text_date", "text_number"]] | None = None


class WorkbookArgs(_Args):
    name: str
    sheets: list[NewSheetSpec] | None = None


# --- compiler tools (research plan §2): explicit lines OR a sheet + column names ----
class _FromSheet(_Args):
    sheet: str | None = Field(None, description="Source sheet when lines are not given")
    workbook_id: str | None = None
    new_sheet_name: str | None = None


class AgingItemArg(_Args):
    party: str
    reference: str = ""
    amount: float
    due_date: str = Field(description="YYYY-MM-DD")


class AgingArgs(_FromSheet):
    as_at: str = Field(description="YYYY-MM-DD")
    kind: Literal["receivables", "payables"] = "receivables"
    items: list[AgingItemArg] | None = None
    party_column: str | None = None
    reference_column: str | None = None
    amount_column: str | None = None
    due_column: str | None = None
    period_label: str | None = None


class WhtLineArg(_Args):
    vendor: str
    category: str
    payee_type: Literal["corporate", "individual"] = "corporate"
    gross_amount: float
    exempt: bool = False


class CreditNoteArg(_Args):
    reference: str = ""
    vendor: str = ""
    amount: float


class WhtScheduleArgs(_FromSheet):
    lines: list[WhtLineArg] | None = None
    credit_notes: list[CreditNoteArg] | None = None
    vendor_column: str | None = None
    category_column: str | None = None
    payee_type_column: str | None = None
    gross_column: str | None = None
    default_category: str | None = None
    default_payee_type: Literal["corporate", "individual"] = "corporate"
    period_label: str | None = None


class VatLineArg(_Args):
    label: str = ""
    net_amount: float


class VatReturnArgs(_FromSheet):
    standard_rated_sales: list[VatLineArg] | None = None
    zero_rated_sales: list[VatLineArg] | None = None
    exempt_sales: list[VatLineArg] | None = None
    standard_rated_purchases: list[VatLineArg] | None = None
    vat_credit_brought_forward: float = 0.0
    type_column: str | None = None
    amount_column: str | None = None
    label_column: str | None = None
    date_column: str | None = None
    tin: str | None = None
    period_label: str | None = None


class EmployeeArg(_Args):
    name: str
    gross_annual: float
    pension: bool = True
    nhf: bool = False


class PayrollArgs(_FromSheet):
    employees: list[EmployeeArg] | None = None
    name_column: str | None = None
    gross_column: str | None = None
    gross_is_monthly: bool = False
    pension: bool = True
    nhf: bool = False
    period_label: str | None = None


class BsLineArg(_Args):
    label: str
    amount: float


class SoaArgs(_FromSheet):
    as_at_label: str = Field(description='e.g. "As at 31 March 2026"')
    non_current_assets: list[BsLineArg] | None = None
    current_assets: list[BsLineArg] | None = None
    current_liabilities: list[BsLineArg] | None = None
    non_current_liabilities: list[BsLineArg] | None = None
    equity: list[BsLineArg] | None = None
    label_column: str | None = None
    group_column: str | None = None
    amount_column: str | None = None


class ComplianceItemArg(_Args):
    requirement: str
    authority: str = "CAC"
    due_date: str = Field(description="YYYY-MM-DD")
    completed: bool = False
    fee: float = 0.0


class CacTrackerArgs(_FromSheet):
    as_at: str = Field(description="YYYY-MM-DD")
    items: list[ComplianceItemArg] | None = None
    requirement_column: str | None = None
    due_column: str | None = None
    completed_column: str | None = None
    fee_column: str | None = None
    authority_column: str | None = None
    rc_number: str | None = None
    tin: str | None = None
    period_label: str | None = None


class TrialBalanceArgs(_Args):
    sheet: str | None = Field(None, description="TB sheet; omitted = the first TB found")
    workbook_id: str | None = None
    write: bool = Field(True, description="false = figures only, no new sheets")
    period_label: str | None = None


class AnnualReportArgs(_Args):
    standard: Literal["ias1", "ifrs18"] | None = None
    contract: dict[str, Any] = Field(description="The annual-report inputs: period_label, "
                                     "as_at_label, schedules, sofp, bank_recon, pnl, socf")


def _ct(fn: Callable[..., ToolOutput]) -> Callable[[ToolContext, BaseModel], ToolOutput]:
    """Run a compiler tool with its typed args as plain dicts."""
    return lambda c, a: fn(c, **a.model_dump(exclude_none=True))


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
                  "Compute CIT, VAT, WHT or PAYE from the shared tax config (always use this; "
                  "never compute tax yourself). write=true lays it out as a new sheet "
                  "(a proposal). inputs by kind — "
                  "cit: net_profit_per_accounts, turnover, total_fixed_assets, "
                  "professional_services (bool), addbacks, deductions, capital_allowances; "
                  "vat: standard_rated_sales, standard_rated_purchases, "
                  "vat_credit_brought_forward, amounts_include_vat (bool); "
                  "wht: gross_amount, category (dividend|interest|rent|royalty|commission|"
                  "consultancy|construction|supply|technical), payee_type "
                  "(individual|corporate), or deductions=[{vendor, category, payee_type, "
                  "gross_amount}] for several lines; "
                  "paye: gross_annual, pension (bool, default true), nhf (bool), rent_paid, "
                  "or employees=[{name, gross_annual, pension, nhf, rent_paid}]. "
                  "Amounts are annual naira.", TaxArgs,
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
    WorkbenchTool("clean_values", "write",
                  "Convert dates typed as text and numbers stored as text into real values "
                  "(same value, correct type) so totals and date filters include them.",
                  CleanArgs, lambda c, a: builders.clean_values(c, **_kw(a)),
                  ("fix the text dates", "convert text numbers", "clean the dates"),
                  risky=True),
    WorkbenchTool("trial_balance_statements", "write",
                  "From a trial balance: check debits equal credits, map each account to an "
                  "IFRS line, and give the income statement (revenue, cost of sales, gross "
                  "profit, admin, finance costs, profit before tax) and the balance sheet as "
                  "new sheets. Use it for any profit, P&L or balance question on a TB.",
                  TrialBalanceArgs,
                  lambda c, a: trial_balance.trial_balance_statements(c, **_kw(a)),
                  ("does the trial balance balance", "profit before tax from the tb",
                   "income statement from the trial balance", "gross profit")),
    # The seven template compilers. Each computes in Python, returns a basis block
    # (rule, rates, config version) and proposes the formula schedule as a new sheet.
    WorkbenchTool("ar_ap_aging", "write",
                  "Age receivables or payables at an as-at date into Not due, 1–30, 31–60, "
                  "61–90 and 90+ day buckets, with totals and the top parties. Give items, or "
                  "a sheet with party, amount and due-date columns.", AgingArgs,
                  _ct(compiler_tools.ar_ap_aging),
                  ("age the debtors", "receivables aging", "who owes us over 90 days",
                   "creditors aging")),
    WorkbenchTool("wht_schedule", "write",
                  "WHT schedule per vendor and category from the tax config: amount to "
                  "remit, credit notes to request, small-supplier candidates flagged. Give "
                  "lines, or a sheet with vendor, category and gross columns.",
                  WhtScheduleArgs, _ct(compiler_tools.wht_schedule),
                  ("wht schedule", "withholding tax to remit", "credit notes to request")),
    WorkbenchTool("vat_return", "write",
                  "VAT return: output VAT, input VAT, net payable, monthly split and the "
                  "filing workings. Give the sales and purchase lines, or a sheet with VAT "
                  "type (standard, zero, exempt, purchase) and net amount columns.",
                  VatReturnArgs, _ct(compiler_tools.vat_return),
                  ("prepare the vat return", "vat filing", "output and input vat")),
    WorkbenchTool("payroll_schedule", "write",
                  "Full payroll from the tax config: PAYE bands, pension, NHF, NSITF, net pay "
                  "and employer cost per employee. Give employees, or a sheet with name and "
                  "gross annual pay columns.", PayrollArgs,
                  _ct(compiler_tools.payroll_schedule),
                  ("run the payroll", "payroll schedule", "net pay for the staff")),
    WorkbenchTool("statement_of_affairs", "write",
                  "Statement of affairs (simple balance sheet) at a date: assets, "
                  "liabilities, net assets and equity, with a balance check. Give the lines, "
                  "or a sheet with account, class and amount columns.", SoaArgs,
                  _ct(compiler_tools.statement_of_affairs),
                  ("statement of affairs", "simple balance sheet for the bank",
                   "net assets at year end")),
    WorkbenchTool("cac_filing_tracker", "write",
                  "CAC annual return and compliance tracker: completion %, overdue filings, "
                  "next due dates and outstanding fees at an as-at date. Give items, or a "
                  "sheet with requirement, due date and completed columns.", CacTrackerArgs,
                  _ct(compiler_tools.cac_filing_tracker),
                  ("cac annual return status", "which filings are overdue",
                   "compliance tracker")),
    WorkbenchTool("annual_report_pack", "write",
                  "IAS 1 or IFRS 18 annual report pack: SOFP, P&L, cash flows, schedules and "
                  "bank reconciliation as linked sheets, ready for review. Needs the full "
                  "annual-report inputs as contract.", AnnualReportArgs,
                  _ct(compiler_tools.annual_report_pack),
                  ("prepare the annual report", "financial statements pack", "ifrs 18 accounts")),
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

"""Profit & Loss template compiler.

Hand-written and deterministic (PRD §3): every computed cell — section totals,
gross/operating/net profit — is an Excel formula. Python never writes a
calculated number as a value, so the zero-math-error guarantee rests entirely
on the recompute gate, not on this code's arithmetic.
"""
from __future__ import annotations

from dataclasses import dataclass

from openpyxl import Workbook
from openpyxl.styles import Border, Font, Side

from litchai.contracts.pnl import LineItem, PnLContract
from litchai.taxconfig import load_tax_config

COMPILER_VERSION = "pnl-1.0.0"

LABEL_COL = "B"
AMOUNT_COL = "C"
NAIRA_FMT = '"₦"#,##0.00'

_TITLE = Font(bold=True, size=14)
_BOLD = Font(bold=True)
_SUBTLE = Font(size=9, color="777777")
_TOP_BORDER = Border(top=Side(style="thin"))
_DOUBLE_TOP = Border(top=Side(style="double"))


@dataclass
class CompiledTemplate:
    workbook: Workbook
    # Named refs ("total_revenue" -> "C10") so validation can locate results
    # without re-deriving the layout.
    key_cells: dict[str, str]
    compiler_version: str


def compile_pnl(contract: PnLContract) -> CompiledTemplate:
    cfg = load_tax_config()
    wb = Workbook()
    ws = wb.active
    ws.title = "P&L"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 2
    ws.column_dimensions[LABEL_COL].width = 42
    ws.column_dimensions[AMOUNT_COL].width = 20

    ws[f"{LABEL_COL}1"] = contract.client_name
    ws[f"{LABEL_COL}1"].font = _TITLE
    ws[f"{LABEL_COL}2"] = "Statement of Profit or Loss"
    ws[f"{LABEL_COL}2"].font = _BOLD
    ws[f"{LABEL_COL}3"] = contract.period_label

    key: dict[str, str] = {}
    row = 5

    def items_section(title: str, items: list[LineItem], total_label: str) -> str:
        nonlocal row
        ws[f"{LABEL_COL}{row}"] = title
        ws[f"{LABEL_COL}{row}"].font = _BOLD
        row += 1
        first = row
        for item in items:
            ws[f"{LABEL_COL}{row}"] = item.label
            cell = ws[f"{AMOUNT_COL}{row}"]
            cell.value = item.amount
            cell.number_format = NAIRA_FMT
            row += 1
        total_ref = f"{AMOUNT_COL}{row}"
        ws[f"{LABEL_COL}{row}"] = total_label
        ws[f"{LABEL_COL}{row}"].font = _BOLD
        total = ws[total_ref]
        total.value = f"=SUM({AMOUNT_COL}{first}:{AMOUNT_COL}{row - 1})"
        total.font = _BOLD
        total.number_format = NAIRA_FMT
        total.border = _TOP_BORDER
        row += 2
        return total_ref

    def result_row(label: str, formula: str, *, double: bool = False) -> str:
        nonlocal row
        ref = f"{AMOUNT_COL}{row}"
        ws[f"{LABEL_COL}{row}"] = label
        ws[f"{LABEL_COL}{row}"].font = _BOLD
        cell = ws[ref]
        cell.value = formula
        cell.font = _BOLD
        cell.number_format = NAIRA_FMT
        cell.border = _DOUBLE_TOP if double else _TOP_BORDER
        row += 2
        return ref

    key["total_revenue"] = items_section("Revenue", contract.revenue, "Total revenue")

    if contract.cost_of_sales:
        key["total_cost_of_sales"] = items_section(
            "Cost of sales", contract.cost_of_sales, "Total cost of sales"
        )
        key["gross_profit"] = result_row(
            "Gross profit", f"={key['total_revenue']}-{key['total_cost_of_sales']}"
        )
    else:
        key["gross_profit"] = result_row("Gross profit", f"={key['total_revenue']}")

    if contract.operating_expenses:
        key["total_operating_expenses"] = items_section(
            "Operating expenses", contract.operating_expenses, "Total operating expenses"
        )
        key["operating_profit"] = result_row(
            "Operating profit", f"={key['gross_profit']}-{key['total_operating_expenses']}"
        )
    else:
        key["operating_profit"] = result_row("Operating profit", f"={key['gross_profit']}")

    if contract.other_income:
        key["total_other_income"] = items_section(
            "Other income", contract.other_income, "Total other income"
        )
        key["net_profit"] = result_row(
            "Net profit", f"={key['operating_profit']}+{key['total_other_income']}", double=True
        )
    else:
        key["net_profit"] = result_row("Net profit", f"={key['operating_profit']}", double=True)

    footer = ws[f"{LABEL_COL}{row + 1}"]
    footer.value = (
        f"LitchAI · compiler {COMPILER_VERSION} · tax config {cfg['version']} · "
        "all computed cells are formulas"
    )
    footer.font = _SUBTLE

    return CompiledTemplate(workbook=wb, key_cells=key, compiler_version=COMPILER_VERSION)

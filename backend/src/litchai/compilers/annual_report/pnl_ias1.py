"""IAS 1 statement of profit or loss and other comprehensive income.

Schedule-driven rows (revenue, cost of sales, distribution, admin) are
cross-sheet links for BOTH year columns — the firm's template hardcodes the
prior year, but one source of truth is strictly stronger and the checks catch
drift. Costs enter negative at the link, matching the template's sign
convention.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import count

from openpyxl.worksheet.worksheet import Worksheet

from litchai.compilers._common import sheet_ref
from litchai.compilers.annual_report._rows import CUR_COL, PRI_COL, SheetWriter
from litchai.compilers.annual_report.schedules import SchedulesRefs


@dataclass(frozen=True)
class PnLRefs:
    """Qualified refs the SOCF builder starts from."""

    socf_start: str
    socf_start_py: str


def build_pnl_ias1(
    ws: Worksheet, contract, key_cells: dict[str, str], refs: SchedulesRefs, notes: count
) -> PnLRefs:
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 52
    for col in ("C", "D", "E"):
        ws.column_dimensions[col].width = 18

    w = SheetWriter(ws)
    w.title_block(
        contract.client_name,
        "Statement of Profit or Loss and Other Comprehensive Income",
        contract.period_label,
        contract.units_label,
    )
    w.year_header()
    p = contract.pnl

    revenue = w.formula_row(
        "Revenue", f"={refs.revenue_total}", f"={refs.revenue_total_py}", note=next(notes)
    )
    cos = w.formula_row(
        "Cost of sales", f"=-{refs.cos_total}", f"=-{refs.cos_total_py}", note=next(notes)
    )
    gp = w.formula_row(
        "Gross profit",
        f"={CUR_COL}{revenue}+{CUR_COL}{cos}",
        f"={PRI_COL}{revenue}+{PRI_COL}{cos}",
        bold=True, border="top",
    )
    w.key("pnl:gross_profit", gp)

    other_income = w.input_row(
        "Other income", p.other_income.current, p.other_income.prior, note=next(notes)
    )
    w.formula_row(
        "Distribution costs",
        f"=-{refs.distribution_total}", f"=-{refs.distribution_total_py}", note=next(notes),
    )
    w.formula_row(
        "Administrative expenses",
        f"=-{refs.admin_total}", f"=-{refs.admin_total_py}", note=next(notes),
    )
    other_expenses = w.input_row(
        "Other expenses", p.other_expenses.current, p.other_expenses.prior, note=next(notes)
    )
    op = w.formula_row(
        "Operating profit",
        f"={CUR_COL}{gp}+SUM({CUR_COL}{other_income}:{CUR_COL}{other_expenses})",
        f"={PRI_COL}{gp}+SUM({PRI_COL}{other_income}:{PRI_COL}{other_expenses})",
        bold=True, border="top",
    )
    w.key("pnl:operating_profit", op)

    finance_income = w.input_row(
        "Finance income", p.finance_income.current, p.finance_income.prior, note=next(notes)
    )
    w.input_row("Finance costs", p.finance_costs.current, p.finance_costs.prior, note=next(notes))
    associates = w.input_row(
        "Share of profit of associates (equity method)",
        p.share_of_associates.current, p.share_of_associates.prior, note=next(notes),
    )
    pbt = w.formula_row(
        "Profit before tax",
        f"={CUR_COL}{op}+SUM({CUR_COL}{finance_income}:{CUR_COL}{associates})",
        f"={PRI_COL}{op}+SUM({PRI_COL}{finance_income}:{PRI_COL}{associates})",
        bold=True, border="top",
    )
    w.key("pnl:profit_before_tax", pbt)

    tax = w.input_row(
        "Income tax expense",
        p.income_tax_expense.current, p.income_tax_expense.prior, note=next(notes),
    )
    profit = w.formula_row(
        "PROFIT FOR THE YEAR",
        f"={CUR_COL}{pbt}+{CUR_COL}{tax}",
        f"={PRI_COL}{pbt}+{PRI_COL}{tax}",
        bold=True, border="double",
    )
    w.key("pnl:profit", profit)

    w.note_text("Other comprehensive income:")
    oci_first = w.input_row(
        "Items that will not be reclassified to profit or loss",
        p.oci_not_reclassified.current, p.oci_not_reclassified.prior, note=next(notes),
    )
    oci_last = w.input_row(
        "Items that may be reclassified subsequently to profit or loss",
        p.oci_reclassifiable.current, p.oci_reclassifiable.prior, note=next(notes),
    )
    oci = w.formula_row(
        "Other comprehensive income for the year, net of tax",
        *w.sum_rows(oci_first, oci_last),
        bold=True, border="top",
    )
    w.key("pnl:oci_total", oci)
    tci = w.formula_row(
        "TOTAL COMPREHENSIVE INCOME FOR THE YEAR",
        f"={CUR_COL}{profit}+{CUR_COL}{oci}",
        f"={PRI_COL}{profit}+{PRI_COL}{oci}",
        bold=True, border="double",
    )
    w.key("pnl:total_comprehensive_income", tci)

    for name, local_ref in w.key_cells.items():
        key_cells[name] = sheet_ref(ws.title, local_ref)

    return PnLRefs(
        socf_start=key_cells["pnl:profit_before_tax"],
        socf_start_py=key_cells["pnl:profit_before_tax:py"],
    )

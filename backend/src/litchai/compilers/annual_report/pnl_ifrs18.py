"""IFRS 18 statement of profit or loss — category structure with the two new
mandatory subtotals (operating profit or loss; profit before financing and
income tax). Unlike the firm's illustration, schedule-driven rows link to the
Schedules sheet in both year columns."""
from __future__ import annotations

from itertools import count

from openpyxl.worksheet.worksheet import Worksheet

from litchai.compilers._common import sheet_ref
from litchai.compilers.annual_report._rows import CUR_COL, PRI_COL, SheetWriter
from litchai.compilers.annual_report.pnl_ias1 import PnLRefs
from litchai.compilers.annual_report.schedules import SchedulesRefs


def build_pnl_ifrs18(
    ws: Worksheet, contract, key_cells: dict[str, str], refs: SchedulesRefs, notes: count
) -> PnLRefs:
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 56
    for col in ("C", "D", "E"):
        ws.column_dimensions[col].width = 18

    w = SheetWriter(ws)
    w.title_block(
        contract.client_name,
        "Statement of Profit or Loss — IFRS 18 structure",
        contract.period_label,
        contract.units_label,
    )
    w.year_header()
    p = contract.pnl

    w.section("OPERATING CATEGORY")
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
    op_first = w.input_row(
        "Other operating income",
        p.other_operating_income.current, p.other_operating_income.prior, note=next(notes),
    )
    w.formula_row(
        "Distribution costs",
        f"=-{refs.distribution_total}", f"=-{refs.distribution_total_py}", note=next(notes),
    )
    w.formula_row(
        "Administrative expenses",
        f"=-{refs.admin_total}", f"=-{refs.admin_total_py}", note=next(notes),
    )
    w.input_row(
        "Other operating expenses",
        p.other_operating_expenses.current, p.other_operating_expenses.prior, note=next(notes),
    )
    op_last = w.input_row(
        "Impairment losses on trade receivables (IFRS 9)",
        p.impairment_receivables.current, p.impairment_receivables.prior, note=next(notes),
    )
    op = w.formula_row(
        "OPERATING PROFIT OR LOSS",
        f"={CUR_COL}{gp}+SUM({CUR_COL}{op_first}:{CUR_COL}{op_last})",
        f"={PRI_COL}{gp}+SUM({PRI_COL}{op_first}:{PRI_COL}{op_last})",
        bold=True, border="double",
    )
    w.key("pnl:operating_profit", op)
    w.note_text("^ IFRS 18 mandatory subtotal — the result of the operating category")
    w.blank()

    w.section("INVESTING CATEGORY")
    inv_first = w.input_row(
        "Interest income on cash and short-term investments",
        p.interest_income.current, p.interest_income.prior, note=next(notes),
    )
    w.input_row(
        "Dividend income", p.dividend_income.current, p.dividend_income.prior, note=next(notes)
    )
    w.input_row(
        "Share of profit of associates/joint ventures (equity method)",
        p.share_of_associates.current, p.share_of_associates.prior, note=next(notes),
    )
    w.input_row(
        "Gain/(loss) on disposal of property, plant and equipment",
        p.disposal_gains.current, p.disposal_gains.prior, note=next(notes),
    )
    inv_last = w.input_row(
        "Fair value gain/(loss) on investment property",
        p.fv_gains_investment_property.current,
        p.fv_gains_investment_property.prior,
        note=next(notes),
    )
    inv_total = w.formula_row(
        "Total investing income and expenses",
        *w.sum_rows(inv_first, inv_last), bold=True, border="top",
    )
    w.key("pnl:investing_total", inv_total)
    w.blank()

    w.section("FINANCING CATEGORY")
    fin_first = w.input_row(
        "Interest expense on borrowings",
        p.interest_on_borrowings.current, p.interest_on_borrowings.prior, note=next(notes),
    )
    w.input_row(
        "Interest expense on lease liabilities",
        p.interest_on_leases.current, p.interest_on_leases.prior, note=next(notes),
    )
    w.input_row(
        "Unwinding of discount on provisions",
        p.provisions_unwinding.current, p.provisions_unwinding.prior, note=next(notes),
    )
    fin_last = w.input_row(
        "Foreign exchange gain/(loss) on financing items",
        p.fx_on_financing.current, p.fx_on_financing.prior, note=next(notes),
    )
    fin_total = w.formula_row(
        "Total financing income and expenses",
        *w.sum_rows(fin_first, fin_last), bold=True, border="top",
    )
    w.key("pnl:financing_total", fin_total)
    pbfit = w.formula_row(
        "PROFIT OR LOSS BEFORE FINANCING AND INCOME TAX",
        f"={CUR_COL}{op}+{CUR_COL}{inv_total}+{CUR_COL}{fin_total}",
        f"={PRI_COL}{op}+{PRI_COL}{inv_total}+{PRI_COL}{fin_total}",
        bold=True, border="double",
    )
    w.key("pnl:pbfit", pbfit)
    w.note_text("^ Second IFRS 18 mandatory subtotal — operating plus investing and financing")
    w.blank()

    w.section("INCOME TAX CATEGORY")
    tax = w.input_row(
        "Income tax expense", p.income_tax_expense.current, p.income_tax_expense.prior
    )
    w.blank()
    w.section("DISCONTINUED OPERATIONS CATEGORY")
    discontinued = w.input_row(
        "Profit/(loss) from discontinued operations, net of tax",
        p.discontinued_operations.current, p.discontinued_operations.prior,
    )
    w.blank()
    profit = w.formula_row(
        "PROFIT OR LOSS FOR THE YEAR",
        f"={CUR_COL}{pbfit}+{CUR_COL}{tax}+{CUR_COL}{discontinued}",
        f"={PRI_COL}{pbfit}+{PRI_COL}{tax}+{PRI_COL}{discontinued}",
        bold=True, border="double",
    )
    w.key("pnl:profit", profit)
    w.blank()

    w.section("OTHER COMPREHENSIVE INCOME (unchanged from IAS 1)")
    oci_first = w.input_row(
        "Items that will not be reclassified to profit or loss",
        p.oci_not_reclassified.current, p.oci_not_reclassified.prior,
    )
    oci_last = w.input_row(
        "Items that may be reclassified subsequently to profit or loss",
        p.oci_reclassifiable.current, p.oci_reclassifiable.prior,
    )
    oci = w.formula_row(
        "Other comprehensive income for the year, net of tax",
        f"={CUR_COL}{oci_first}+{CUR_COL}{oci_last}",
        f"={PRI_COL}{oci_first}+{PRI_COL}{oci_last}",
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
        socf_start=key_cells["pnl:operating_profit"],
        socf_start_py=key_cells["pnl:operating_profit:py"],
    )

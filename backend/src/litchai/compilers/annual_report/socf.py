"""Statement of cash flows, indirect method — one builder, two starting points.

IAS 1 starts from profit before tax (with finance add-backs among the
reconciliation rows); IFRS 18's amended-IAS 7 presentation starts from
operating profit. The cash check ties the closing balance to the SOFP cash
cell and must recompute to zero (current year, like the template).
"""
from __future__ import annotations

from openpyxl.worksheet.worksheet import Worksheet

from litchai.compilers._common import sheet_ref
from litchai.compilers.annual_report._rows import CUR_COL, PRI_COL, SheetWriter
from litchai.contracts.annual_report import SOCFCommon


def build_socf(
    ws: Worksheet,
    contract,
    key_cells: dict[str, str],
    *,
    subtitle: str,
    starting_label: str,
    starting_ref: str,
    starting_ref_py: str,
    recon_rows: list[tuple[str, float, float]],
    sofp_cash_ref: str,
) -> None:
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 56
    for col in ("C", "D", "E"):
        ws.column_dimensions[col].width = 18

    w = SheetWriter(ws)
    w.title_block(contract.client_name, subtitle, contract.period_label, contract.units_label)
    w.year_header()
    socf: SOCFCommon = contract.socf

    w.section("Cash flows from operating activities")
    start = w.formula_row(starting_label, f"={starting_ref}", f"={starting_ref_py}")
    recon_first = w.row
    for label, current, prior in recon_rows:
        w.input_row(label, current, prior)
    recon_last = w.row - 1
    before_wc = w.formula_row(
        "Operating cash flows before working capital changes",
        f"={CUR_COL}{start}+SUM({CUR_COL}{recon_first}:{CUR_COL}{recon_last})",
        f"={PRI_COL}{start}+SUM({PRI_COL}{recon_first}:{PRI_COL}{recon_last})",
        bold=True, border="top",
    )
    w.key("socf:operating_before_wc", before_wc)

    delta_first = w.input_row(
        "(Increase)/decrease in inventories",
        socf.delta_inventories.current, socf.delta_inventories.prior,
    )
    w.input_row(
        "(Increase)/decrease in trade and other receivables",
        socf.delta_receivables.current, socf.delta_receivables.prior,
    )
    delta_last = w.input_row(
        "Increase/(decrease) in trade and other payables",
        socf.delta_payables.current, socf.delta_payables.prior,
    )
    generated = w.formula_row(
        "Cash generated from operations",
        f"={CUR_COL}{before_wc}+SUM({CUR_COL}{delta_first}:{CUR_COL}{delta_last})",
        f"={PRI_COL}{before_wc}+SUM({PRI_COL}{delta_first}:{PRI_COL}{delta_last})",
        bold=True, border="top",
    )
    w.key("socf:cash_generated", generated)
    tax = w.input_row("Income tax paid", socf.tax_paid.current, socf.tax_paid.prior)
    net_op = w.formula_row(
        "Net cash generated from/(used in) operating activities",
        f"={CUR_COL}{generated}+{CUR_COL}{tax}",
        f"={PRI_COL}{generated}+{PRI_COL}{tax}",
        bold=True, border="top",
    )
    w.key("socf:net_operating", net_op)
    w.blank()

    w.section("Cash flows from investing activities")
    inv_first = w.input_row(
        "Purchase of property, plant and equipment",
        socf.ppe_purchases.current, socf.ppe_purchases.prior,
    )
    w.input_row(
        "Proceeds from disposal of property, plant and equipment",
        socf.ppe_disposal_proceeds.current, socf.ppe_disposal_proceeds.prior,
    )
    w.input_row(
        "Purchase of intangible assets",
        socf.intangibles_purchases.current, socf.intangibles_purchases.prior,
    )
    w.input_row(
        "Interest received", socf.interest_received.current, socf.interest_received.prior
    )
    w.input_row(
        "Dividends received", socf.dividends_received.current, socf.dividends_received.prior
    )
    inv_last = w.input_row(
        "(Investment in)/proceeds from short-term investments",
        socf.short_term_investments_movement.current,
        socf.short_term_investments_movement.prior,
    )
    net_inv = w.formula_row(
        "Net cash generated from/(used in) investing activities",
        *w.sum_rows(inv_first, inv_last), bold=True, border="top",
    )
    w.key("socf:net_investing", net_inv)
    w.blank()

    w.section("Cash flows from financing activities")
    fin_first = w.input_row(
        "Proceeds from borrowings",
        socf.borrowings_proceeds.current, socf.borrowings_proceeds.prior,
    )
    w.input_row(
        "Repayment of borrowings", socf.borrowings_repaid.current, socf.borrowings_repaid.prior
    )
    w.input_row(
        "Payment of lease liabilities (principal)",
        socf.lease_principal_paid.current, socf.lease_principal_paid.prior,
    )
    w.input_row("Interest paid", socf.interest_paid.current, socf.interest_paid.prior)
    w.input_row(
        "Proceeds from issue of share capital",
        socf.share_issue_proceeds.current, socf.share_issue_proceeds.prior,
    )
    fin_last = w.input_row(
        "Dividends paid", socf.dividends_paid.current, socf.dividends_paid.prior
    )
    net_fin = w.formula_row(
        "Net cash generated from/(used in) financing activities",
        *w.sum_rows(fin_first, fin_last), bold=True, border="top",
    )
    w.key("socf:net_financing", net_fin)
    w.blank()

    net_change = w.formula_row(
        "Net increase/(decrease) in cash and cash equivalents",
        f"={CUR_COL}{net_op}+{CUR_COL}{net_inv}+{CUR_COL}{net_fin}",
        f"={PRI_COL}{net_op}+{PRI_COL}{net_inv}+{PRI_COL}{net_fin}",
        bold=True, border="top",
    )
    w.key("socf:net_change", net_change)
    opening = w.input_row(
        "Cash and cash equivalents at beginning of year",
        socf.opening_cash.current, socf.opening_cash.prior,
    )
    fx = w.input_row(
        "Effect of exchange rate changes on cash held",
        socf.fx_effect.current, socf.fx_effect.prior,
    )
    closing = w.formula_row(
        "CASH AND CASH EQUIVALENTS AT END OF YEAR",
        f"={CUR_COL}{net_change}+{CUR_COL}{opening}+{CUR_COL}{fx}",
        f"={PRI_COL}{net_change}+{PRI_COL}{opening}+{PRI_COL}{fx}",
        bold=True, border="double",
    )
    w.key("socf:closing_cash", closing)
    check = w.formula_row(
        "Check: per Statement of Financial Position (should equal zero)",
        f"={CUR_COL}{closing}-{sofp_cash_ref}",
    )
    w.key("socf:cash_check", check, prior=False)

    for name, local_ref in w.key_cells.items():
        key_cells[name] = sheet_ref(ws.title, local_ref)

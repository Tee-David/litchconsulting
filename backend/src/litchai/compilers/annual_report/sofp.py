"""Statement of financial position (shared by both variants).

Current-year PPE, inventories, receivables, payables and cash are cross-sheet
links (Schedules / Bank Recon); the balance check must recompute to zero for
both year columns.
"""
from __future__ import annotations

from itertools import count

from openpyxl.worksheet.worksheet import Worksheet

from litchai.compilers._common import sheet_ref
from litchai.compilers.annual_report._rows import CUR_COL, PRI_COL, SheetWriter
from litchai.compilers.annual_report.schedules import SchedulesRefs


def build_sofp(
    ws: Worksheet,
    contract,
    key_cells: dict[str, str],
    refs: SchedulesRefs,
    cash_feed_ref: str,
    notes: count,
) -> None:
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 52
    for col in ("C", "D", "E"):
        ws.column_dimensions[col].width = 18

    w = SheetWriter(ws)
    w.title_block(
        contract.client_name,
        "Statement of Financial Position",
        contract.as_at_label,
        contract.units_label,
    )
    w.year_header()
    f = contract.sofp

    w.section("ASSETS")
    w.section("Non-current assets")
    nca_first = w.mixed_row(
        "Property, plant and equipment",
        f"={refs.ppe_nbv_total}", f.ppe_prior, note=next(notes),
    )
    w.input_row(
        "Right-of-use assets", f.right_of_use.current, f.right_of_use.prior, note=next(notes)
    )
    w.input_row(
        "Intangible assets", f.intangibles.current, f.intangibles.prior, note=next(notes)
    )
    w.input_row(
        "Investment property",
        f.investment_property.current, f.investment_property.prior, note=next(notes),
    )
    w.input_row(
        "Investments in associates/joint ventures",
        f.associates.current, f.associates.prior, note=next(notes),
    )
    w.input_row(
        "Deferred tax assets",
        f.deferred_tax_assets.current, f.deferred_tax_assets.prior, note=next(notes),
    )
    nca_last = w.input_row(
        "Other non-current assets",
        f.other_non_current.current, f.other_non_current.prior, note=next(notes),
    )
    nca = w.formula_row(
        "Total non-current assets", *w.sum_rows(nca_first, nca_last), bold=True, border="top"
    )
    w.key("sofp:total_non_current_assets", nca)
    w.blank()

    w.section("Current assets")
    ca_first = w.formula_row(
        "Inventories",
        f"={refs.inventories_total}", f"={refs.inventories_total_py}", note=next(notes),
    )
    w.formula_row(
        "Trade and other receivables",
        f"={refs.receivables_total}", f"={refs.receivables_total_py}", note=next(notes),
    )
    w.input_row("Prepayments", f.prepayments.current, f.prepayments.prior, note=next(notes))
    w.input_row(
        "Short-term investments",
        f.short_term_investments.current, f.short_term_investments.prior, note=next(notes),
    )
    ca_last = w.mixed_row(
        "Cash and cash equivalents", f"={cash_feed_ref}", f.cash_prior, note=next(notes)
    )
    # Current year only: the prior-year cell is a direct input (the bank
    # recon feed is single-period), so it must not register as computed.
    w.key("sofp:cash", ca_last, prior=False)
    ca = w.formula_row(
        "Total current assets", *w.sum_rows(ca_first, ca_last), bold=True, border="top"
    )
    w.key("sofp:total_current_assets", ca)
    assets = w.formula_row(
        "TOTAL ASSETS",
        f"={CUR_COL}{nca}+{CUR_COL}{ca}",
        f"={PRI_COL}{nca}+{PRI_COL}{ca}",
        bold=True, border="double",
    )
    w.key("sofp:total_assets", assets)
    w.blank()

    w.section("EQUITY AND LIABILITIES")
    w.section("Equity")
    eq_first = w.input_row(
        "Share capital", f.share_capital.current, f.share_capital.prior, note=next(notes)
    )
    w.input_row(
        "Share premium", f.share_premium.current, f.share_premium.prior, note=next(notes)
    )
    w.input_row(
        "Retained earnings",
        f.retained_earnings.current, f.retained_earnings.prior, note=next(notes),
    )
    eq_last = w.input_row(
        "Other reserves", f.other_reserves.current, f.other_reserves.prior, note=next(notes)
    )
    equity = w.formula_row(
        "Total equity", *w.sum_rows(eq_first, eq_last), bold=True, border="top"
    )
    w.key("sofp:total_equity", equity)
    w.blank()

    w.section("Non-current liabilities")
    ncl_first = w.input_row(
        "Long-term borrowings",
        f.long_term_borrowings.current, f.long_term_borrowings.prior, note=next(notes),
    )
    w.input_row(
        "Lease liabilities (non-current)",
        f.lease_liabilities_non_current.current,
        f.lease_liabilities_non_current.prior,
        note=next(notes),
    )
    w.input_row(
        "Deferred tax liabilities",
        f.deferred_tax_liabilities.current, f.deferred_tax_liabilities.prior, note=next(notes),
    )
    ncl_last = w.input_row(
        "Provisions (non-current)",
        f.provisions_non_current.current, f.provisions_non_current.prior, note=next(notes),
    )
    ncl = w.formula_row(
        "Total non-current liabilities", *w.sum_rows(ncl_first, ncl_last), bold=True, border="top"
    )
    w.key("sofp:total_non_current_liabilities", ncl)
    w.blank()

    w.section("Current liabilities")
    cl_first = w.formula_row(
        "Trade and other payables",
        f"={refs.payables_total}", f"={refs.payables_total_py}", note=next(notes),
    )
    w.input_row(
        "Short-term borrowings",
        f.short_term_borrowings.current, f.short_term_borrowings.prior, note=next(notes),
    )
    w.input_row(
        "Lease liabilities (current)",
        f.lease_liabilities_current.current,
        f.lease_liabilities_current.prior,
        note=next(notes),
    )
    w.input_row(
        "Current tax payable",
        f.current_tax_payable.current, f.current_tax_payable.prior, note=next(notes),
    )
    cl_last = w.input_row(
        "Provisions (current)",
        f.provisions_current.current, f.provisions_current.prior, note=next(notes),
    )
    cl = w.formula_row(
        "Total current liabilities", *w.sum_rows(cl_first, cl_last), bold=True, border="top"
    )
    w.key("sofp:total_current_liabilities", cl)
    liabilities = w.formula_row(
        "TOTAL LIABILITIES",
        f"={CUR_COL}{ncl}+{CUR_COL}{cl}",
        f"={PRI_COL}{ncl}+{PRI_COL}{cl}",
        bold=True, border="top",
    )
    w.key("sofp:total_liabilities", liabilities)
    eandl = w.formula_row(
        "TOTAL EQUITY AND LIABILITIES",
        f"={CUR_COL}{equity}+{CUR_COL}{liabilities}",
        f"={PRI_COL}{equity}+{PRI_COL}{liabilities}",
        bold=True, border="double",
    )
    w.key("sofp:total_equity_and_liabilities", eandl)
    w.blank()

    check = w.formula_row(
        "Balance check (Total assets − Total equity and liabilities; must equal zero)",
        f"={CUR_COL}{assets}-{CUR_COL}{eandl}",
        f"={PRI_COL}{assets}-{PRI_COL}{eandl}",
    )
    w.key("sofp:balance_check", check)

    for name, local_ref in w.key_cells.items():
        key_cells[name] = sheet_ref(ws.title, local_ref)

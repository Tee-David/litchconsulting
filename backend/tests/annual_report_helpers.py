"""Golden-mirror arithmetic for the annual-report compilers.

These mirrors re-derive every named subtotal in plain Python from the
contract, independently of the compiler's formulas — the recompute gate then
asserts LibreOffice's evaluation of the generated workbook matches them for
both year columns. Keys follow the multi-sheet key_cells convention
("sofp:total_assets", prior year suffixed ":py").
"""
import json
from pathlib import Path

from litchai.contracts.annual_report import (
    AnnualReportIAS1Contract,
    AnnualReportIFRS18Contract,
)

FIXTURES = Path(__file__).parent.parent / "fixtures" / "synthetic"


def load_annual_fixture(name: str):
    data = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    cls = {
        "ias1": AnnualReportIAS1Contract,
        "ifrs18": AnnualReportIFRS18Contract,
    }[data["standard"]]
    return cls.model_validate(data)


def _deep_merge(base: dict, overrides: dict) -> dict:
    merged = dict(base)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def fixture_annual_report(standard: str = "ias1", **overrides):
    """Contract builder for edge cases: the basic fixture with nested
    overrides deep-merged in, e.g.
    fixture_annual_report(sofp={"retained_earnings": {"current": 68050}})."""
    data = json.loads(
        (FIXTURES / f"annual_report_{standard}_basic.json").read_text(encoding="utf-8")
    )
    data = _deep_merge(data, overrides)
    cls = {
        "ias1": AnnualReportIAS1Contract,
        "ifrs18": AnnualReportIFRS18Contract,
    }[data["standard"]]
    return cls.model_validate(data)


def _pair(field) -> tuple[float, float]:
    return field.current, field.prior


def _sum_lines(lines) -> tuple[float, float]:
    return sum(x.current for x in lines), sum(x.prior for x in lines)


def _shared_golden(c) -> dict[str, float]:
    """Schedules, bank recon and SOFP mirrors — identical for both variants."""
    g: dict[str, float] = {}
    s = c.schedules

    rev = _sum_lines(s.revenue)
    cos = _sum_lines(s.cost_of_sales)
    dist = _sum_lines(s.distribution_costs)
    admin = _sum_lines(s.admin_expenses)
    inv = _sum_lines(s.inventories)
    recv = _sum_lines(s.receivables)
    pay = _sum_lines(s.payables)
    g["schedules:revenue_total"], g["schedules:revenue_total:py"] = rev
    g["schedules:cos_total"], g["schedules:cos_total:py"] = cos
    g["schedules:distribution_total"], g["schedules:distribution_total:py"] = dist
    g["schedules:admin_total"], g["schedules:admin_total:py"] = admin
    g["schedules:inventories_total"], g["schedules:inventories_total:py"] = inv
    g["schedules:receivables_total"], g["schedules:receivables_total:py"] = recv
    g["schedules:payables_total"], g["schedules:payables_total:py"] = pay

    ppe_nbv = sum(
        (p.cost_opening + p.additions + p.disposals)
        - (p.dep_opening + p.dep_charge + p.dep_disposals)
        for p in s.ppe_classes
    )
    g["schedules:ppe_nbv_total"] = ppe_nbv

    ageing = s.receivables_ageing
    gross_trade = s.receivables[0].current if s.receivables else 0.0
    g["schedules:receivables_ageing_check"] = (
        ageing.not_due + ageing.d1_30 + ageing.d31_90 + ageing.over_90 - gross_trade
    )

    b = c.bank_recon
    deposits = sum(x.amount for x in b.deposits_in_transit)
    cheques = sum(x.amount for x in b.outstanding_cheques)
    credits = sum(x.amount for x in b.unrecorded_credits)
    debits = sum(x.amount for x in b.unrecorded_debits)
    adjusted_bank = b.statement_balance + deposits - cheques
    adjusted_books = b.book_balance + credits - debits
    g["bank_recon:adjusted_bank"] = adjusted_bank
    g["bank_recon:adjusted_books"] = adjusted_books
    g["bank_recon:difference_check"] = adjusted_bank - adjusted_books
    g["bank_recon:feed"] = adjusted_books

    f = c.sofp
    nca = ppe_nbv + sum(
        x.current
        for x in (
            f.right_of_use,
            f.intangibles,
            f.investment_property,
            f.associates,
            f.deferred_tax_assets,
            f.other_non_current,
        )
    )
    nca_py = f.ppe_prior + sum(
        x.prior
        for x in (
            f.right_of_use,
            f.intangibles,
            f.investment_property,
            f.associates,
            f.deferred_tax_assets,
            f.other_non_current,
        )
    )
    ca = inv[0] + recv[0] + f.prepayments.current + f.short_term_investments.current + adjusted_books
    ca_py = inv[1] + recv[1] + f.prepayments.prior + f.short_term_investments.prior + f.cash_prior
    equity = sum(
        x.current
        for x in (f.share_capital, f.share_premium, f.retained_earnings, f.other_reserves)
    )
    equity_py = sum(
        x.prior
        for x in (f.share_capital, f.share_premium, f.retained_earnings, f.other_reserves)
    )
    ncl = sum(
        x.current
        for x in (
            f.long_term_borrowings,
            f.lease_liabilities_non_current,
            f.deferred_tax_liabilities,
            f.provisions_non_current,
        )
    )
    ncl_py = sum(
        x.prior
        for x in (
            f.long_term_borrowings,
            f.lease_liabilities_non_current,
            f.deferred_tax_liabilities,
            f.provisions_non_current,
        )
    )
    cl = pay[0] + sum(
        x.current
        for x in (
            f.short_term_borrowings,
            f.lease_liabilities_current,
            f.current_tax_payable,
            f.provisions_current,
        )
    )
    cl_py = pay[1] + sum(
        x.prior
        for x in (
            f.short_term_borrowings,
            f.lease_liabilities_current,
            f.current_tax_payable,
            f.provisions_current,
        )
    )
    g["sofp:total_non_current_assets"], g["sofp:total_non_current_assets:py"] = nca, nca_py
    g["sofp:total_current_assets"], g["sofp:total_current_assets:py"] = ca, ca_py
    g["sofp:total_assets"], g["sofp:total_assets:py"] = nca + ca, nca_py + ca_py
    g["sofp:total_equity"], g["sofp:total_equity:py"] = equity, equity_py
    g["sofp:total_non_current_liabilities"] = ncl
    g["sofp:total_non_current_liabilities:py"] = ncl_py
    g["sofp:total_current_liabilities"], g["sofp:total_current_liabilities:py"] = cl, cl_py
    g["sofp:total_liabilities"], g["sofp:total_liabilities:py"] = ncl + cl, ncl_py + cl_py
    g["sofp:total_equity_and_liabilities"] = equity + ncl + cl
    g["sofp:total_equity_and_liabilities:py"] = equity_py + ncl_py + cl_py
    g["sofp:balance_check"] = (nca + ca) - (equity + ncl + cl)
    g["sofp:balance_check:py"] = (nca_py + ca_py) - (equity_py + ncl_py + cl_py)
    return g


def _socf_golden(
    g: dict[str, float], socf, start: tuple[float, float], addbacks: list[tuple[float, float]]
) -> None:
    """Indirect-method mirror; `start` is the variant's starting subtotal and
    `addbacks` its variant-specific reconciliation rows."""
    common = [
        _pair(socf.dep_ppe),
        _pair(socf.amort_intangibles),
        _pair(socf.dep_right_of_use),
        _pair(socf.disposal_gain_loss),
        _pair(socf.impairments),
    ]
    before_wc = (
        start[0] + sum(x[0] for x in common) + sum(x[0] for x in addbacks),
        start[1] + sum(x[1] for x in common) + sum(x[1] for x in addbacks),
    )
    deltas = [
        _pair(socf.delta_inventories),
        _pair(socf.delta_receivables),
        _pair(socf.delta_payables),
    ]
    generated = (
        before_wc[0] + sum(x[0] for x in deltas),
        before_wc[1] + sum(x[1] for x in deltas),
    )
    net_op = (generated[0] + socf.tax_paid.current, generated[1] + socf.tax_paid.prior)
    investing_rows = [
        _pair(socf.ppe_purchases),
        _pair(socf.ppe_disposal_proceeds),
        _pair(socf.intangibles_purchases),
        _pair(socf.interest_received),
        _pair(socf.dividends_received),
        _pair(socf.short_term_investments_movement),
    ]
    net_inv = (sum(x[0] for x in investing_rows), sum(x[1] for x in investing_rows))
    financing_rows = [
        _pair(socf.borrowings_proceeds),
        _pair(socf.borrowings_repaid),
        _pair(socf.lease_principal_paid),
        _pair(socf.interest_paid),
        _pair(socf.share_issue_proceeds),
        _pair(socf.dividends_paid),
    ]
    net_fin = (sum(x[0] for x in financing_rows), sum(x[1] for x in financing_rows))
    net_change = (net_op[0] + net_inv[0] + net_fin[0], net_op[1] + net_inv[1] + net_fin[1])
    closing = (
        net_change[0] + socf.opening_cash.current + socf.fx_effect.current,
        net_change[1] + socf.opening_cash.prior + socf.fx_effect.prior,
    )
    g["socf:operating_before_wc"], g["socf:operating_before_wc:py"] = before_wc
    g["socf:cash_generated"], g["socf:cash_generated:py"] = generated
    g["socf:net_operating"], g["socf:net_operating:py"] = net_op
    g["socf:net_investing"], g["socf:net_investing:py"] = net_inv
    g["socf:net_financing"], g["socf:net_financing:py"] = net_fin
    g["socf:net_change"], g["socf:net_change:py"] = net_change
    g["socf:closing_cash"], g["socf:closing_cash:py"] = closing
    # The template's cash check exists for the current year only (SOCF D48).
    g["socf:cash_check"] = closing[0] - g["bank_recon:adjusted_books"]


def golden_ias1(c: AnnualReportIAS1Contract) -> dict[str, float]:
    g = _shared_golden(c)
    p = c.pnl
    rev = (g["schedules:revenue_total"], g["schedules:revenue_total:py"])
    cos = (g["schedules:cos_total"], g["schedules:cos_total:py"])
    dist = (g["schedules:distribution_total"], g["schedules:distribution_total:py"])
    admin = (g["schedules:admin_total"], g["schedules:admin_total:py"])
    gp = (rev[0] - cos[0], rev[1] - cos[1])
    op = (
        gp[0] + p.other_income.current - dist[0] - admin[0] + p.other_expenses.current,
        gp[1] + p.other_income.prior - dist[1] - admin[1] + p.other_expenses.prior,
    )
    pbt = (
        op[0] + p.finance_income.current + p.finance_costs.current + p.share_of_associates.current,
        op[1] + p.finance_income.prior + p.finance_costs.prior + p.share_of_associates.prior,
    )
    profit = (pbt[0] + p.income_tax_expense.current, pbt[1] + p.income_tax_expense.prior)
    oci = (
        p.oci_not_reclassified.current + p.oci_reclassifiable.current,
        p.oci_not_reclassified.prior + p.oci_reclassifiable.prior,
    )
    g["pnl:gross_profit"], g["pnl:gross_profit:py"] = gp
    g["pnl:operating_profit"], g["pnl:operating_profit:py"] = op
    g["pnl:profit_before_tax"], g["pnl:profit_before_tax:py"] = pbt
    g["pnl:profit"], g["pnl:profit:py"] = profit
    g["pnl:oci_total"], g["pnl:oci_total:py"] = oci
    g["pnl:total_comprehensive_income"] = profit[0] + oci[0]
    g["pnl:total_comprehensive_income:py"] = profit[1] + oci[1]

    addbacks = [
        _pair(c.socf.finance_costs_addback),
        _pair(c.socf.finance_income_addback),
        _pair(c.socf.share_of_associates_addback),
    ]
    _socf_golden(g, c.socf, pbt, addbacks)
    return g


def golden_ifrs18(c: AnnualReportIFRS18Contract) -> dict[str, float]:
    g = _shared_golden(c)
    p = c.pnl
    rev = (g["schedules:revenue_total"], g["schedules:revenue_total:py"])
    cos = (g["schedules:cos_total"], g["schedules:cos_total:py"])
    dist = (g["schedules:distribution_total"], g["schedules:distribution_total:py"])
    admin = (g["schedules:admin_total"], g["schedules:admin_total:py"])
    gp = (rev[0] - cos[0], rev[1] - cos[1])
    op = (
        gp[0]
        + p.other_operating_income.current
        - dist[0]
        - admin[0]
        + p.other_operating_expenses.current
        + p.impairment_receivables.current,
        gp[1]
        + p.other_operating_income.prior
        - dist[1]
        - admin[1]
        + p.other_operating_expenses.prior
        + p.impairment_receivables.prior,
    )
    investing_rows = [
        _pair(p.interest_income),
        _pair(p.dividend_income),
        _pair(p.share_of_associates),
        _pair(p.disposal_gains),
        _pair(p.fv_gains_investment_property),
    ]
    inv = (sum(x[0] for x in investing_rows), sum(x[1] for x in investing_rows))
    financing_rows = [
        _pair(p.interest_on_borrowings),
        _pair(p.interest_on_leases),
        _pair(p.provisions_unwinding),
        _pair(p.fx_on_financing),
    ]
    fin = (sum(x[0] for x in financing_rows), sum(x[1] for x in financing_rows))
    pbfit = (op[0] + inv[0] + fin[0], op[1] + inv[1] + fin[1])
    profit = (
        pbfit[0] + p.income_tax_expense.current + p.discontinued_operations.current,
        pbfit[1] + p.income_tax_expense.prior + p.discontinued_operations.prior,
    )
    oci = (
        p.oci_not_reclassified.current + p.oci_reclassifiable.current,
        p.oci_not_reclassified.prior + p.oci_reclassifiable.prior,
    )
    g["pnl:gross_profit"], g["pnl:gross_profit:py"] = gp
    g["pnl:operating_profit"], g["pnl:operating_profit:py"] = op
    g["pnl:investing_total"], g["pnl:investing_total:py"] = inv
    g["pnl:financing_total"], g["pnl:financing_total:py"] = fin
    g["pnl:pbfit"], g["pnl:pbfit:py"] = pbfit
    g["pnl:profit"], g["pnl:profit:py"] = profit
    g["pnl:oci_total"], g["pnl:oci_total:py"] = oci
    g["pnl:total_comprehensive_income"] = profit[0] + oci[0]
    g["pnl:total_comprehensive_income:py"] = profit[1] + oci[1]

    _socf_golden(g, c.socf, op, addbacks=[])
    return g

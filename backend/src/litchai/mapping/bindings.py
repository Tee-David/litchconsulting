"""Declarative bindings: taxonomy leaf → statement row → contract field.

Presentation is configuration — the schedule bindings are shared by both
variants and a future standard is a new binding table over the same
taxonomy, not new code. `sign` converts the cash-view net (inflows positive)
into the statement's as-displayed convention. Worksheet refs are never
stored here; they resolve from the compiler's key_cells at compile time.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# Postable transaction leaves that deliberately never reach a statement:
# internal transfers net out of the P&L, and suspense must be empty before a
# compile is allowed.
EXCLUDED_FROM_STATEMENTS = frozenset({"transfers.internal", "suspense.uncategorized"})


@dataclass(frozen=True)
class Binding:
    category_code: str
    statement_row: str  # stable row id, e.g. "schedules.revenue", "pnl.other_income"
    contract_path: str  # dotted path into the contract; list targets get appended lines
    sign: Literal[1, -1] = 1


def _schedule(code: str, list_name: str) -> Binding:
    # Schedule lines display outflow-natured amounts positive, hence sign -1
    # for expense buckets (their cash net is negative).
    sign = 1 if list_name == "revenue" else -1
    return Binding(code, f"schedules.{list_name}", f"schedules.{list_name}", sign)


SCHEDULE_BINDINGS: tuple[Binding, ...] = (
    _schedule("revenue.goods", "revenue"),
    _schedule("revenue.services", "revenue"),
    _schedule("revenue.rental", "revenue"),
    _schedule("revenue.other", "revenue"),
    _schedule("cos.purchases", "cost_of_sales"),
    _schedule("cos.direct_labour", "cost_of_sales"),
    _schedule("cos.direct_overheads", "cost_of_sales"),
    _schedule("dist.freight", "distribution_costs"),
    _schedule("dist.commissions", "distribution_costs"),
    _schedule("dist.marketing", "distribution_costs"),
    _schedule("dist.sales_staff", "distribution_costs"),
    _schedule("admin.staff_salaries", "admin_expenses"),
    _schedule("admin.rent_utilities", "admin_expenses"),
    _schedule("admin.professional_fees", "admin_expenses"),
    _schedule("admin.it_comm", "admin_expenses"),
    _schedule("admin.office_general", "admin_expenses"),
    _schedule("admin.statutory_fees", "admin_expenses"),
    _schedule("bank.charges", "admin_expenses"),
)

# Cash-flow placements shared by both variants (contract paths are YearPair
# fields on SOCFCommon; as-displayed signs follow the template: payments
# negative, receipts positive — i.e. the cash net passes through unchanged).
SOCF_BINDINGS: tuple[Binding, ...] = (
    Binding("tax.income_tax", "socf.tax_paid", "socf.tax_paid"),
    Binding("capex.ppe.additions", "socf.ppe_purchases", "socf.ppe_purchases"),
    Binding(
        "capex.ppe.disposal_proceeds", "socf.ppe_disposal_proceeds", "socf.ppe_disposal_proceeds"
    ),
    Binding("capex.intangibles", "socf.intangibles_purchases", "socf.intangibles_purchases"),
    Binding(
        "capex.short_term_investments",
        "socf.short_term_investments_movement",
        "socf.short_term_investments_movement",
    ),
    Binding("finance.income", "socf.interest_received", "socf.interest_received"),
    Binding("fin_activity.borrow_proceeds", "socf.borrowings_proceeds", "socf.borrowings_proceeds"),
    Binding("fin_activity.borrow_repayment", "socf.borrowings_repaid", "socf.borrowings_repaid"),
    Binding(
        "fin_activity.lease_principal", "socf.lease_principal_paid", "socf.lease_principal_paid"
    ),
    Binding("fin_activity.share_issue", "socf.share_issue_proceeds", "socf.share_issue_proceeds"),
    Binding("fin_activity.dividends_paid", "socf.dividends_paid", "socf.dividends_paid"),
    Binding("finance.costs.interest", "socf.interest_paid", "socf.interest_paid"),
    Binding("finance.costs.lease", "socf.interest_paid", "socf.interest_paid"),
)

IAS1_FACE_BINDINGS: tuple[Binding, ...] = (
    Binding("other_income.operating", "pnl.other_income", "pnl.other_income"),
    Binding("other_expenses.operating", "pnl.other_expenses", "pnl.other_expenses"),
    Binding("finance.income", "pnl.finance_income", "pnl.finance_income"),
    Binding("finance.costs.interest", "pnl.finance_costs", "pnl.finance_costs"),
    Binding("finance.costs.lease", "pnl.finance_costs", "pnl.finance_costs"),
    Binding("tax.income_tax", "pnl.income_tax_expense", "pnl.income_tax_expense"),
)

IFRS18_FACE_BINDINGS: tuple[Binding, ...] = (
    Binding(
        "other_income.operating", "pnl.other_operating_income", "pnl.other_operating_income"
    ),
    Binding(
        "other_expenses.operating", "pnl.other_operating_expenses", "pnl.other_operating_expenses"
    ),
    Binding("finance.income", "pnl.interest_income", "pnl.interest_income"),
    Binding("finance.costs.interest", "pnl.interest_on_borrowings", "pnl.interest_on_borrowings"),
    Binding("finance.costs.lease", "pnl.interest_on_leases", "pnl.interest_on_leases"),
    Binding("tax.income_tax", "pnl.income_tax_expense", "pnl.income_tax_expense"),
)

IAS1_BINDINGS: tuple[Binding, ...] = SCHEDULE_BINDINGS + IAS1_FACE_BINDINGS + SOCF_BINDINGS
IFRS18_BINDINGS: tuple[Binding, ...] = SCHEDULE_BINDINGS + IFRS18_FACE_BINDINGS + SOCF_BINDINGS


def bindings_for(variant: str) -> tuple[Binding, ...]:
    return {"ias1": IAS1_BINDINGS, "ifrs18": IFRS18_BINDINGS}[variant]

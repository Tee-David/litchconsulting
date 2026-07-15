"""Annual-report contract family — the structured input for the multi-sheet
IAS 1 / IFRS 18 annual-report compilers (modelled on the firm's two template
workbooks in plans/).

Sign convention: every amount is entered exactly as it displays in the
statement — expenses, outflows, closing-inventory/ECL/provision offsets and
PPE disposals are negative; bank-recon rows are positive magnitudes combined
by formula. Schedule-driven statement rows (revenue, COS, distribution,
admin, PPE NBV, inventories, receivables, payables, cash) carry no amounts
here: both year columns become cross-sheet formulas in the compiled workbook.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class YearPair(BaseModel):
    current: float = 0.0
    prior: float = 0.0


class ScheduleLine(BaseModel):
    label: str
    current: float
    prior: float = 0.0


class PPEClass(BaseModel):
    """One asset-class column of the PPE movement grid (current year only,
    like the template). Disposal rows are negative by convention."""

    label: str
    cost_opening: float
    additions: float = 0.0
    disposals: float = 0.0
    dep_opening: float
    dep_charge: float = 0.0
    dep_disposals: float = 0.0


class Ageing(BaseModel):
    """Informational current-year ageing analysis (Schedules 7/8)."""

    not_due: float = 0.0
    d1_30: float = 0.0
    d31_90: float = 0.0
    over_90: float = 0.0


class SupportingSchedules(BaseModel):
    revenue: list[ScheduleLine] = Field(min_length=1)
    cost_of_sales: list[ScheduleLine] = []
    distribution_costs: list[ScheduleLine] = []
    admin_expenses: list[ScheduleLine] = []
    ppe_classes: list[PPEClass] = Field(min_length=1, max_length=8)
    inventories: list[ScheduleLine] = []
    receivables: list[ScheduleLine] = []
    receivables_ageing: Ageing = Ageing()
    payables: list[ScheduleLine] = []
    payables_ageing: Ageing = Ageing()


class DatedLine(BaseModel):
    date: str
    description: str
    amount: float


class BankReconSection(BaseModel):
    """Single-month reconciliation; amounts are positive magnitudes — the
    compiled formulas add deposits/credits and subtract cheques/debits."""

    account_label: str
    statement_balance: float
    deposits_in_transit: list[DatedLine] = []
    outstanding_cheques: list[DatedLine] = []
    book_balance: float
    unrecorded_credits: list[DatedLine] = []
    unrecorded_debits: list[DatedLine] = []
    prepared_by: str = ""
    prepared_date: str = ""
    reviewed_by: str = ""
    reviewed_date: str = ""


class SOFPInputs(BaseModel):
    """Direct-input SOFP rows. PPE current-year NBV, inventories, receivables,
    payables and current-year cash are cross-sheet formulas, not inputs; the
    movement grid and recon are current-period only, hence the two scalar
    prior-year exceptions."""

    ppe_prior: float = 0.0
    right_of_use: YearPair = YearPair()
    intangibles: YearPair = YearPair()
    investment_property: YearPair = YearPair()
    associates: YearPair = YearPair()
    deferred_tax_assets: YearPair = YearPair()
    other_non_current: YearPair = YearPair()
    prepayments: YearPair = YearPair()
    short_term_investments: YearPair = YearPair()
    cash_prior: float = 0.0
    share_capital: YearPair = YearPair()
    share_premium: YearPair = YearPair()
    retained_earnings: YearPair = YearPair()
    other_reserves: YearPair = YearPair()
    long_term_borrowings: YearPair = YearPair()
    lease_liabilities_non_current: YearPair = YearPair()
    deferred_tax_liabilities: YearPair = YearPair()
    provisions_non_current: YearPair = YearPair()
    short_term_borrowings: YearPair = YearPair()
    lease_liabilities_current: YearPair = YearPair()
    current_tax_payable: YearPair = YearPair()
    provisions_current: YearPair = YearPair()


class SOCFCommon(BaseModel):
    """Indirect-method rows shared by both variants (as-displayed signs)."""

    dep_ppe: YearPair = YearPair()
    amort_intangibles: YearPair = YearPair()
    dep_right_of_use: YearPair = YearPair()
    disposal_gain_loss: YearPair = YearPair()
    impairments: YearPair = YearPair()
    delta_inventories: YearPair = YearPair()
    delta_receivables: YearPair = YearPair()
    delta_payables: YearPair = YearPair()
    tax_paid: YearPair = YearPair()
    ppe_purchases: YearPair = YearPair()
    ppe_disposal_proceeds: YearPair = YearPair()
    intangibles_purchases: YearPair = YearPair()
    interest_received: YearPair = YearPair()
    dividends_received: YearPair = YearPair()
    short_term_investments_movement: YearPair = YearPair()
    borrowings_proceeds: YearPair = YearPair()
    borrowings_repaid: YearPair = YearPair()
    lease_principal_paid: YearPair = YearPair()
    interest_paid: YearPair = YearPair()
    share_issue_proceeds: YearPair = YearPair()
    dividends_paid: YearPair = YearPair()
    opening_cash: YearPair = YearPair()
    fx_effect: YearPair = YearPair()


class SOCFIAS1Inputs(SOCFCommon):
    """IAS 1 starts from profit before tax, so financing/investing P&L items
    are added back to reach operating cash flows."""

    finance_costs_addback: YearPair = YearPair()
    finance_income_addback: YearPair = YearPair()
    share_of_associates_addback: YearPair = YearPair()


class PnLIAS1Inputs(BaseModel):
    other_income: YearPair = YearPair()
    other_expenses: YearPair = YearPair()
    finance_income: YearPair = YearPair()
    finance_costs: YearPair = YearPair()
    share_of_associates: YearPair = YearPair()
    income_tax_expense: YearPair = YearPair()
    oci_not_reclassified: YearPair = YearPair()
    oci_reclassifiable: YearPair = YearPair()


class PnLIFRS18Inputs(BaseModel):
    # operating category (schedule-driven rows excluded — they're formulas)
    other_operating_income: YearPair = YearPair()
    other_operating_expenses: YearPair = YearPair()
    impairment_receivables: YearPair = YearPair()
    # investing category
    interest_income: YearPair = YearPair()
    dividend_income: YearPair = YearPair()
    share_of_associates: YearPair = YearPair()
    disposal_gains: YearPair = YearPair()
    fv_gains_investment_property: YearPair = YearPair()
    # financing category
    interest_on_borrowings: YearPair = YearPair()
    interest_on_leases: YearPair = YearPair()
    provisions_unwinding: YearPair = YearPair()
    fx_on_financing: YearPair = YearPair()
    income_tax_expense: YearPair = YearPair()
    discontinued_operations: YearPair = YearPair()
    oci_not_reclassified: YearPair = YearPair()
    oci_reclassifiable: YearPair = YearPair()


class MPMReconciliation(BaseModel):
    """One management-defined performance measure (IFRS 18 single-note
    disclosure): comparable IFRS subtotal + reconciling items -> MPM total."""

    name: str
    rationale: str = ""
    comparable_subtotal_label: str
    comparable_subtotal: YearPair = YearPair()
    reconciling_items: list[ScheduleLine] = []
    tax_effect: YearPair = YearPair()
    nci_effect: YearPair = YearPair()


class _AnnualReportBase(BaseModel):
    client_name: str
    period_label: str  # "For the year ended 31 December 2025"
    as_at_label: str  # "As at 31 December 2025"
    units_label: str = (
        "(Amounts in Nigerian Naira, thousands (₦'000) unless otherwise stated)"
    )
    schedules: SupportingSchedules
    sofp: SOFPInputs
    bank_recon: BankReconSection


class AnnualReportIAS1Contract(_AnnualReportBase):
    standard: Literal["ias1"] = "ias1"
    pnl: PnLIAS1Inputs
    socf: SOCFIAS1Inputs


class AnnualReportIFRS18Contract(_AnnualReportBase):
    standard: Literal["ifrs18"] = "ifrs18"
    pnl: PnLIFRS18Inputs
    socf: SOCFCommon
    mpms: list[MPMReconciliation] = []


AnnualReportContract = AnnualReportIAS1Contract | AnnualReportIFRS18Contract

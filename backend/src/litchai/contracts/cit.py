"""Company Income Tax (CIT) Computation & Capital Allowance Register contract (v1.1).

Net profit per accounts, adjustments, and the small-company test inputs
(turnover, fixed assets, professional-services flag) are the raw inputs; the
compiler derives assessable profit, the small-company determination, the CIT rate
choice and the Development Levy as formulas over config-sourced threshold/rate
cells (NTA 2025: 30% standard / 0% small ≤₦100m turnover ∧ ≤₦250m assets,
professional services excluded; 4% Development Levy, small companies exempt).
"""
from __future__ import annotations

from pydantic import BaseModel


class AdjLine(BaseModel):
    label: str
    amount: float


class CapitalAllowanceAsset(BaseModel):
    description: str
    cost: float
    allowance_rate_pct: float  # combined capital-allowance rate for the period


class CitContract(BaseModel):
    client_name: str
    period_label: str
    currency: str = "NGN"
    net_profit_per_accounts: float
    disallowable_addbacks: list[AdjLine] = []   # depreciation, donations, fines …
    other_deductions: list[AdjLine] = []        # allowable deductions not in the accounts
    turnover: float
    total_fixed_assets: float
    professional_services: bool = False
    capital_allowance_assets: list[CapitalAllowanceAsset] = []

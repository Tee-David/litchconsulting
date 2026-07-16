"""Withholding Tax (WHT) Schedule & Credit Note Reconciliation contract (v1.1).

Rates depend on the payment category and whether the payee is a company or an
individual (read from the shared tax config). Gross amounts are inputs; WHT
deducted and the reconciliation are formulas. The ₦2m/month small-supplier
exemption is an operator-set flag on the line (flag, never silently apply).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class WhtLine(BaseModel):
    vendor: str
    category: str  # a key in tax config wht.rates (supply, consultancy, rent, …)
    payee_type: Literal["corporate", "individual"] = "corporate"
    gross_amount: float
    exempt: bool = False  # small-supplier / statutory exemption applied


class WhtCreditNote(BaseModel):
    reference: str
    vendor: str = ""
    amount: float


class WhtScheduleContract(BaseModel):
    client_name: str
    period_label: str
    currency: str = "NGN"
    deductions: list[WhtLine] = []          # WHT the firm deducted (to remit)
    credit_notes: list[WhtCreditNote] = []  # credit notes issued for those deductions

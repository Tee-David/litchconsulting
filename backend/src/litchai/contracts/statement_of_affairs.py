"""Statement of Affairs / Simple Balance Sheet contract (v1.1).

The lightweight balance sheet a client hands a bank or investor when a full
annual report is overkill (the annual-report SOFP sheet is the richer version).
Line amounts are inputs; every subtotal, net assets and the balance check are
formulas.
"""
from __future__ import annotations

from pydantic import BaseModel


class BsLine(BaseModel):
    label: str
    amount: float


class StatementOfAffairsContract(BaseModel):
    client_name: str
    as_at_label: str
    currency: str = "NGN"
    non_current_assets: list[BsLine] = []
    current_assets: list[BsLine] = []
    current_liabilities: list[BsLine] = []
    non_current_liabilities: list[BsLine] = []
    equity: list[BsLine] = []

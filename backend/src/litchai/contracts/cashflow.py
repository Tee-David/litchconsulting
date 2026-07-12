"""Cash Flow Statement (Direct method) contract (PRD step 5).

Direct method: actual cash receipts and payments grouped by activity. Flows
naturally from the categorized ledger / bank-statement cash movements LitchAI
already ingests.
"""
from __future__ import annotations

from pydantic import BaseModel


class CashLine(BaseModel):
    label: str
    amount: float


class CashflowContract(BaseModel):
    client_name: str
    period_label: str
    currency: str = "NGN"
    opening_cash: float
    operating_receipts: list[CashLine] = []
    operating_payments: list[CashLine] = []
    investing_receipts: list[CashLine] = []
    investing_payments: list[CashLine] = []
    financing_receipts: list[CashLine] = []
    financing_payments: list[CashLine] = []

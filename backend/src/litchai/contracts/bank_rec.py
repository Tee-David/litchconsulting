"""Bank Reconciliation Statement contract (PRD step 5)."""
from __future__ import annotations

from pydantic import BaseModel


class RecItem(BaseModel):
    label: str
    amount: float


class BankRecContract(BaseModel):
    client_name: str
    period_label: str
    currency: str = "NGN"
    balance_per_bank: float
    deposits_in_transit: list[RecItem] = []
    outstanding_cheques: list[RecItem] = []
    balance_per_books: float
    add_to_books: list[RecItem] = []
    less_from_books: list[RecItem] = []

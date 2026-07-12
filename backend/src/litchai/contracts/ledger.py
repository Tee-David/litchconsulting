"""General Ledger / Categorized Bookkeeping Summary contract (PRD step 5)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Transaction(BaseModel):
    date: str
    description: str
    category: str
    direction: Literal["in", "out"]
    amount: float


class LedgerContract(BaseModel):
    client_name: str
    period_label: str
    currency: str = "NGN"
    transactions: list[Transaction] = Field(min_length=1)

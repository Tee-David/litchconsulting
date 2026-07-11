"""P&L template contract — the fixed structured input every P&L compile starts
from (PRD step 5 / FR5). Upstream stages (extraction, categorization) produce
this; the compiler consumes nothing else.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class LineItem(BaseModel):
    label: str
    amount: float


class PnLContract(BaseModel):
    client_name: str
    period_label: str
    currency: str = "NGN"
    revenue: list[LineItem] = Field(min_length=1)
    cost_of_sales: list[LineItem] = []
    operating_expenses: list[LineItem] = []
    other_income: list[LineItem] = []

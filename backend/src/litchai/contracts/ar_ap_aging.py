"""Accounts Receivable / Payable Aging (Debtors / Creditors) contract (v1.1).

Outstanding items carry an amount and a due date; the single "as at" date and the
bucket boundaries are the only other inputs. The compiler computes each item's age
and assigns it to an aging bucket with formulas — nothing is pre-bucketed.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel


class AgingItem(BaseModel):
    party: str
    reference: str
    amount: float
    due_date: date


class AgingContract(BaseModel):
    client_name: str
    period_label: str
    as_at: date
    kind: Literal["receivables", "payables"] = "receivables"
    items: list[AgingItem] = []

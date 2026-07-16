"""CAC Annual Return & Statutory Compliance Tracker contract (v1.1).

A tracker of filing obligations (CAC annual return, TIN validation, VAT/PAYE
remittances, e-invoicing readiness). Each item has a due date, a completed flag
and a fee; the compiler derives completion %, overdue counts and outstanding fees
with formulas so the summary can never drift from the rows.
"""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class ComplianceItem(BaseModel):
    requirement: str
    authority: str = "CAC"
    due_date: date
    completed: bool = False
    fee: float = 0.0


class CacTrackerContract(BaseModel):
    client_name: str
    period_label: str
    as_at: date
    rc_number: str | None = None
    tin: str | None = None
    items: list[ComplianceItem] = []

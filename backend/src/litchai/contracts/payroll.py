"""PAYE & Statutory Payroll Run contract (PRD step 5)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class Employee(BaseModel):
    name: str
    gross_annual: float
    pension: bool = True
    nhf: bool = False


class PayrollContract(BaseModel):
    client_name: str
    period_label: str
    currency: str = "NGN"
    employees: list[Employee] = Field(min_length=1)

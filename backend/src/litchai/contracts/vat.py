"""VAT Returns Pack contract (v1.1).

Nigeria's 7.5% standard rate (read from the shared tax config, never hardcoded).
Net (VAT-exclusive) amounts are the raw inputs; the compiler derives every VAT
figure and the net payable as formulas. Zero-rated and exempt supplies carry no
output tax but are disclosed for the NRS (formerly FIRS) filing summary.
"""
from __future__ import annotations

from pydantic import BaseModel


class VatLine(BaseModel):
    label: str
    net_amount: float  # VAT-exclusive


class VatReturnContract(BaseModel):
    client_name: str
    period_label: str
    currency: str = "NGN"
    tin: str | None = None
    standard_rated_sales: list[VatLine] = []
    zero_rated_sales: list[VatLine] = []
    exempt_sales: list[VatLine] = []
    standard_rated_purchases: list[VatLine] = []  # input VAT reclaimable
    vat_credit_brought_forward: float = 0.0       # prior-period credit c/f

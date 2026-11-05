"""Synthetic ledger + bank statement with hand-computed golden answers.

Ledger (income/expense listing, credit = income, debit = expense) and a bank
statement for the same quarter. Planted on purpose:
* ledger row 13 duplicates row 12 (transfer posted twice) -> outstanding item
* bank charges 5,000 appear only on the bank statement -> "less from books"
* internet 45,000 is in the ledger but not yet through the bank
* ledger row 11 date is typed as text ("12/03/2025")
Golden: revenue 7,500,000; COS 1,250,000; opex 1,695,000; net profit 4,555,000;
bank closing 4,595,000; books 3,555,000; reconciled difference 0.
"""
from __future__ import annotations

import io
from datetime import date

from openpyxl import Workbook

LEDGER = [
    (date(2025, 1, 5), "Sales invoice INV001 Okonkwo Farms", "INV001", None, 2_500_000),
    (date(2025, 1, 8), "Purchase of feed", "PO101", 800_000, None),
    (date(2025, 1, 15), "Staff salaries January", "PAY01", 600_000, None),
    (date(2025, 1, 20), "Office rent", "RNT01", 300_000, None),
    (date(2025, 2, 3), "Sales invoice INV002", "INV002", None, 1_800_000),
    (date(2025, 2, 10), "Consultancy fees paid", "CF01", 150_000, None),
    (date(2025, 2, 14), "Purchase of feed", "PO102", 450_000, None),
    (date(2025, 2, 28), "Staff salaries February", "PAY02", 600_000, None),
    (date(2025, 3, 5), "Sales invoice INV003", "INV003", None, 3_200_000),
    ("12/03/2025", "Internet subscription", "IT01", 45_000, None),
    (date(2025, 3, 15), "Transfer to savings", "TRF01", 1_000_000, None),
    (date(2025, 3, 15), "Transfer to savings", "TRF01", 1_000_000, None),
]

BANK = [
    (date(2025, 1, 6), "TRF FROM OKONKWO FARMS", None, 2_500_000),
    (date(2025, 1, 9), "FEED SUPPLIER LTD", 800_000, None),
    (date(2025, 1, 15), "SALARY JAN", 600_000, None),
    (date(2025, 1, 21), "RENT PAYMENT", 300_000, None),
    (date(2025, 2, 4), "TRF FROM ADA NWOSU", None, 1_800_000),
    (date(2025, 2, 10), "CONSULTANCY", 150_000, None),
    (date(2025, 2, 15), "FEED SUPPLIER LTD", 450_000, None),
    (date(2025, 2, 28), "SALARY FEB", 600_000, None),
    (date(2025, 3, 6), "INV003 RECEIPT", None, 3_200_000),
    (date(2025, 3, 15), "TRANSFER TO SAVINGS", 1_000_000, None),
    (date(2025, 3, 31), "BANK CHARGES", 5_000, None),
]
OPENING = 1_000_000

GOLDEN = {
    "revenue": 7_500_000, "cos": 1_250_000, "opex": 1_695_000, "net_profit": 4_555_000,
    "transfers": 2_000_000, "bank_closing": 4_595_000, "books": 3_555_000,
    "ledger_debits": 4_945_000, "ledger_credits": 7_500_000,
}

CATEGORY_RULES = (
    ("SALES", "revenue.goods"), ("FEED", "cos.purchases"), ("SALAR", "admin.staff_salaries"),
    ("RENT", "admin.rent_utilities"), ("CONSULT", "admin.professional_fees"),
    ("INTERNET", "admin.it_comm"), ("TRANSFER", "transfers.internal"),
)


def scripted_categoriser(normalized: str) -> tuple[str, str | None, float]:
    text = normalized.upper()
    for key, code in CATEGORY_RULES:
        if key in text:
            return code, "exact", 0.95
    return "suspense.uncategorized", None, 0.0


def ledger_bank_xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Ledger"
    ws.append(["Date", "Description", "Reference", "Debit", "Credit"])
    for row in LEDGER:
        ws.append(list(row))
    bank = wb.create_sheet("Bank")
    bank.append(["Date", "Description", "Debit", "Credit", "Balance"])
    bal = OPENING
    for d, desc, dr, cr in BANK:
        bal += (cr or 0) - (dr or 0)
        bank.append([d, desc, dr, cr, bal])
    cover = wb.create_sheet("Notes")
    cover["A1"] = "Prepared for FY2025 review"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def trial_balance_xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "TB"
    ws.append(["Account", "Class", "Amount"])
    for row in (
        ("Plant and machinery", "Non-current assets", 12_000_000),
        ("Cash at bank", "Current assets", 4_595_000),
        ("Trade receivables", "Current assets", 1_405_000),
        ("Trade payables", "Current liabilities", 2_000_000),
        ("Term loan", "Non-current liabilities", 6_000_000),
        ("Share capital", "Equity", 5_000_000),
        ("Retained earnings", "Equity", 5_000_000),
    ):
        ws.append(list(row))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def payroll_xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Staff"
    ws.append(["Employee", "Department", "Gross annual"])
    for row in (("Ada", "Finance", 4_800_000), ("Bayo", "Ops", 3_000_000),
                ("Chidi", "Finance", 12_000_000), ("Dupe", "Ops", 800_000)):
        ws.append(list(row))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()

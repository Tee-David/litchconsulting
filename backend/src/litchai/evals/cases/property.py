"""Case 6: a property company, year to 31 Dec 2025 (fictional data).

Lekki Gardens Properties Ltd lets flats and shops. Planted, as audits find:

P1  two tenants paid two years' rent in advance (from 1 Jul 2025); all of it is
    in this year's income;
P2  refundable tenant deposits are in income;
P3  no 10% WHT deducted on the office rent the company pays to a landlord company;
P4  service charge collected with the rent is inside rent income.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from litchai.evals.cases import Case, Problem
from litchai.evals.cases.common import balance_tb, r2, xlsx

YE = date(2025, 12, 31)


def build(seed: int = 2025) -> Case:
    from litchai.taxconfig import load_tax_config

    wht = load_tax_config()["wht"]["rates"]["rent"]["corporatePct"] / 100
    rnd = random.Random(seed)
    names = ("Adebayo Stores", "Chioma Okeke", "Lagos Pharmacy Ltd", "Bisi Hair Studio",
             "Tunde Afolabi", "Greenleaf Foods Ltd", "Musa Bello", "Kemi Phones",
             "Ngozi Eze", "Royal Tailors")
    roll, ahead = [], 0.0
    for i, n in enumerate(names):
        rent = float(rnd.choice([2_400_000, 3_600_000, 4_800_000, 6_000_000, 9_000_000]))
        sc = r2(rent * 0.12)
        if i in (2, 5):  # P1: two years from 1 Jul 2025
            a, b, years = date(2025, 7, 1), date(2027, 6, 30), 2
        else:
            a, b, years = date(2025, 1, 1), date(2025, 12, 31), 1
        received = r2(rent * years)
        if b > YE:
            ahead += received * ((b - YE).days) / ((b - a).days + 1)
        roll.append([n, f"Unit {i + 1:02d}", a, b, rent, received, r2(sc * years),
                     a - timedelta(days=rnd.randint(3, 20))])
    ahead = r2(ahead)
    service = r2(sum(x[6] for x in roll))  # P4
    deposits = r2(sum(x[4] * 0.5 for x in roll[:6]))  # P2
    rent_income = r2(sum(x[5] for x in roll) + service)
    pay = []
    for mth in range(1, 13):
        pay.append(["Ikoyi Towers Ltd", "Company", date(2025, mth, 5), 1_500_000.0, 0.0,
                    1_500_000.0])  # P3
    for mth in (3, 9):
        pay.append(["Mrs Funke Adeyemi", "Individual", date(2025, mth, 10), 600_000.0,
                    60_000.0, 540_000.0])
    no_wht = r2(sum(p[3] for p in pay if p[4] == 0) * wht)
    tb = balance_tb([
        ("1100", "Bank", 512_300_000.0, 0.0), ("1200", "Investment property", 2_150_000_000.0, 0.0),
        ("2100", "Accruals", 0.0, 8_400_000.0), ("3000", "Share capital", 0.0, 400_000_000.0),
        ("4000", "Rent income", 0.0, rent_income),
        ("4100", "Other income - tenant deposits", 0.0, deposits),
        ("6100", "Office rent", r2(sum(p[3] for p in pay)), 0.0),
        ("6200", "Repairs and maintenance", 31_200_000.0, 0.0),
        ("6300", "Salaries", 54_000_000.0, 0.0)])
    files = {
        "Rent_Roll_2025.xlsx": xlsx({"Tenants": [
            ["Tenant", "Unit", "Period from", "Period to", "Annual rent", "Amount received",
             "Service charge included", "Date received"], *roll]}),
        "Office_Rent_Payments_2025.xlsx": xlsx({"Payments": [
            ["Landlord", "Landlord type", "Date paid", "Gross rent", "WHT deducted", "Net paid"],
            *pay]}),
        "LekkiGardens_Books_31Dec2025.xlsx": xlsx({"Trial balance": [
            ["Account code", "Account name", "Debit", "Credit"], *[list(x) for x in tb]]}),
    }
    problems = [
        Problem("P1", "Two years' rent in advance all taken as income",
                [r"advance|deferred|later year|unearned|2026|2027", r"rent|income"], ahead,
                "Rent roll: Lagos Pharmacy, Greenleaf Foods"),
        Problem("P2", "Tenant deposits in income",
                [r"deposit", r"liabilit|refundable|owed back|not income"], deposits, "TB 4100"),
        Problem("P3", "No WHT on rent paid to Ikoyi Towers Ltd",
                [r"wht|withholding", r"ikoyi|compan|landlord|office rent"], no_wht,
                "Office rent payments"),
        Problem("P4", "Service charge inside rent income",
                [r"service charge", r"separat|rent income|mixed|inside|in rent"], service,
                "Rent roll: Service charge included"),
    ]
    return Case(
        slug="property", client="Lekki Gardens Properties Ltd", period="Year to 31 Dec 2025",
        files=files,
        prompts=[
            ("We let flats and shops in Lekki. Here is our rent roll, what we pay for our own "
             "office, and the trial balance. Our income looks too good this year. Please check "
             "the books and tell me what is wrong, with amounts."),
            "Is our rent income right? And are we doing the tax on rent properly?",
            "What entries do we need before we close the year?",
        ],
        problems=problems,
        figures={"rent_in_advance": ahead, "deposits": deposits, "wht_not_deducted": no_wht,
                 "service_charge": service},
    )

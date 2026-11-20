"""Case 9: a small group of two companies and their director, 2025 (fictional data).

Adeola Holdings Ltd owns Adeola Foods Ltd; Mr Adeola runs both. Planted:

P1  the director's personal costs (school fees, a Dubai holiday, home diesel) paid
    by Holdings and booked as expenses;
P2  the intercompany balances do not agree (a payment in transit not booked by Foods);
P3  an interest-free loan to the director;
P4  Holdings' sales to Foods are not eliminated for the group accounts.
"""
from __future__ import annotations

import random
from datetime import date

from litchai.evals.cases import Case, Problem
from litchai.evals.cases.common import balance_tb, r2, xlsx


def build(seed: int = 2025) -> Case:
    rnd = random.Random(seed)
    normal = ("Office stationery", "Diesel for office generator", "Audit fee deposit",
              "Internet subscription", "Staff training", "Vehicle repairs", "Cleaning services",
              "Security services", "Courier", "Bank charges")
    personal = [("School fees - children (first term)", 4_850_000.0),
                ("School fees - children (second term)", 4_850_000.0),
                ("Family holiday Dubai - flights", 6_420_000.0),
                ("Diesel for director's home", 1_380_000.0),
                ("Birthday party - Mrs Adeola", 2_150_000.0)]
    exp = []
    for i in range(70):
        d = date(2025, rnd.randint(1, 12), rnd.randint(1, 28))
        exp.append([d, rnd.choice(("Total Energies", "Jumia", "PwC", "MTN", "Swiss Hotel",
                                   "AutoFix", "CleanCo", "Guard Ltd", "DHL", "Zenith")),
                    rnd.choice(normal), float(rnd.randrange(50_000, 900_000, 1_000))])
    for desc, amt in personal:  # P1
        exp.append([date(2025, rnd.randint(1, 12), rnd.randint(1, 28)), "Various", desc, amt])
    exp.sort(key=lambda x: x[0])
    personal_tot = r2(sum(a for _, a in personal))
    ic_sales = 84_600_000.0  # P4
    due_from = 31_400_000.0
    in_transit = 7_500_000.0  # P2: Foods paid on 30 Dec; Holdings has not booked it
    due_to = due_from - in_transit
    loan = 25_000_000.0  # P3
    hold = balance_tb([
        ("1100", "Bank", 142_000_000.0, 0.0), ("1200", "Due from Adeola Foods Ltd", due_from, 0.0),
        ("1250", "Loan to director", loan, 0.0), ("3000", "Share capital", 0.0, 100_000_000.0),
        ("4000", "Revenue - third parties", 0.0, 310_000_000.0),
        ("4010", "Sales to Adeola Foods Ltd", 0.0, ic_sales),
        ("5000", "Cost of sales", 248_000_000.0, 0.0),
        ("6100", "Administrative expenses", r2(sum(x[3] for x in exp)), 0.0)])
    foods = balance_tb([
        ("1100", "Bank", 38_200_000.0, 0.0), ("1300", "Inventory", 41_000_000.0, 0.0),
        ("2100", "Due to Adeola Holdings Ltd", 0.0, due_to),
        ("3000", "Share capital", 0.0, 20_000_000.0), ("4000", "Revenue", 0.0, 205_000_000.0),
        ("5000", "Purchases from Adeola Holdings Ltd", ic_sales, 0.0),
        ("5010", "Other purchases", 61_000_000.0, 0.0), ("6100", "Expenses", 22_000_000.0, 0.0)])
    files = {
        "AdeolaHoldings_Books_31Dec2025.xlsx": xlsx({"Trial balance": [
            ["Account code", "Account name", "Debit", "Credit"], *[list(x) for x in hold]]}),
        "AdeolaFoods_Books_31Dec2025.xlsx": xlsx({"Trial balance": [
            ["Account code", "Account name", "Debit", "Credit"], *[list(x) for x in foods]]}),
        "Holdings_Admin_Expenses_2025.xlsx": xlsx({"Expenses": [
            ["Date", "Payee", "Description", "Amount"], *exp]}),
    }
    problems = [
        Problem("P1", "Director's personal costs booked as company expenses",
                [r"personal|school fees|holiday|private", r"director|not (a )?company|disallow"],
                personal_tot, "Holdings admin expenses"),
        Problem("P2", "Intercompany balances do not agree",
                [r"intercompany|due (from|to)|between the companies", r"agree|differ|mismatch|reconcil"],
                in_transit, "Holdings 1200 vs Foods 2100"),
        Problem("P3", "Interest-free loan to the director",
                [r"director", r"loan"], loan, "Holdings 1250"),
        Problem("P4", "Intercompany sales not eliminated",
                [r"intercompany|sales to adeola foods|within the group", r"eliminat|consolidat|remove"],
                ic_sales, "Holdings 4010 / Foods 5000"),
    ]
    return Case(
        slug="group", client="Adeola Holdings Ltd and Adeola Foods Ltd",
        period="Year to 31 Dec 2025", files=files,
        prompts=[
            ("I own two companies: Adeola Holdings and Adeola Foods. Here are both trial balances "
             "and the Holdings expenses list. The bank wants group accounts. Please check "
             "everything and tell me what is wrong before we prepare them."),
            "Do the balances between the two companies agree?",
            "What entries and eliminations do we need for the group accounts?",
        ],
        problems=problems,
        figures={"personal": personal_tot, "in_transit": in_transit, "director_loan": loan,
                 "intercompany_sales": ic_sales},
    )

"""Case 11: messy files from a small distributor, Q3 2025 (fictional data).

Owo Distribution Ventures keeps its cash book by hand in Excel. Planted data-hygiene
traps (the books are otherwise simple):

P1  amounts typed as text ("1,250,000.00" with a leading apostrophe or spaces);
P2  dates typed as text, some dd/mm/yyyy and some mm/dd/yyyy;
P3  the same receipts entered twice (copied rows);
A title row sits above the column names: the table must still be read correctly
(not scored as a problem; it is a reading test).
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from litchai.evals.cases import Case, Problem
from litchai.evals.cases.common import r2, xlsx


def build(seed: int = 2025) -> Case:
    rnd = random.Random(seed)
    rows, text_amounts, text_dates = [], 0, 0
    day = date(2025, 7, 1)
    bal = 4_800_000.0
    while day <= date(2025, 9, 30):
        if day.weekday() < 6 and rnd.random() < 0.8:
            inflow = rnd.random() < 0.55
            amt = float(rnd.randrange(20_000, 1_800_000, 250))
            bal = r2(bal + amt if inflow else bal - amt)
            d: object = day
            if rnd.random() < 0.18:  # P2: typed as text, mixed formats
                d = day.strftime("%d/%m/%Y") if rnd.random() < 0.6 else day.strftime("%m/%d/%Y")
                text_dates += 1
            a: object = amt
            if rnd.random() < 0.15:  # P1: amount as text
                a = f" {amt:,.2f}"
                text_amounts += 1
            rows.append([d, rnd.choice(("Sales - Ikeja", "Sales - Ojota", "Fuel", "Loading",
                                        "Supplier - Dangote", "Supplier - Nestle", "Salary advance")),
                         a if inflow else None, None if inflow else a, bal])
        day += timedelta(days=1)
    dups = rnd.sample(range(10, len(rows) - 10), 4)
    dup_total = 0.0
    for i in sorted(dups, reverse=True):  # P3
        row = list(rows[i])
        rows.insert(i + 1, row)
        v = row[2] if row[2] is not None else row[3]
        dup_total += float(str(v).replace(",", "").strip())
    # count after the copies: a copied row repeats its text cells
    text_dates = sum(isinstance(r[0], str) for r in rows)
    text_amounts = sum(isinstance(v, str) for r in rows for v in r[2:4])
    sheet = [["OWO DISTRIBUTION VENTURES - CASH BOOK JULY TO SEPTEMBER 2025", None, None, None, None],
             ["Date", "Details", "Money in", "Money out", "Balance"], *rows]  # P4
    files = {"Owo_CashBook_Q3_2025.xlsx": xlsx({"Cash book": sheet})}
    problems = [
        Problem("P1", "Amounts typed as text",
                [r"text|stored as text|typed as", r"number|amount|figure"], None,
                f"{text_amounts} cells"),
        Problem("P2", "Dates typed as text (mixed formats)",
                [r"date", r"text|format|typed|dd/mm|mm/dd"], None, f"{text_dates} cells"),
        Problem("P3", "Rows entered twice",
                [r"duplicat|twice|repeated|copied", r"row|entr|receipt|line|payment|same"], r2(dup_total),
                "4 copied rows"),
    ]
    return Case(
        slug="messy", client="Owo Distribution Ventures", period="Q3 2025 (Jul-Sep)",
        files=files,
        prompts=[
            ("This is our cash book for July to September. My accountant says the totals don't "
             "add up and the file is a mess. Please clean it up and tell me what was wrong."),
            "What are the real totals of money in and money out for the quarter?",
        ],
        problems=problems,
        figures={"text_amounts": text_amounts, "text_dates": text_dates,
                 "duplicate_total": r2(dup_total)},
    )

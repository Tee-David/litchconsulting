"""Case 7: a plastics manufacturer, year to 31 Dec 2025 (fictional data).

Ogun Plastics Manufacturing Ltd makes buckets, chairs and crates. Planted:

P1  the year-end count differs from the stock ledger on four items (shortages);
P2  obsolete moulds and an old chair range are held at cost above what they can be
    sold for (NRV);
P3  raw materials are valued at the last purchase price, not the weighted average
    of the year's purchases;
P4  raw materials and finished goods sit in one stock account.
"""
from __future__ import annotations

import random
from datetime import date

from litchai.evals.cases import Case, Problem
from litchai.evals.cases.common import balance_tb, r2, xlsx


def build(seed: int = 2025) -> Case:
    rnd = random.Random(seed)
    raw = [("RM-01", "PP granules (kg)"), ("RM-02", "HDPE granules (kg)"),
           ("RM-03", "Colour masterbatch (kg)"), ("RM-04", "UV additive (kg)"),
           ("RM-05", "Cartons (pcs)")]
    fg = [("FG-01", "20L bucket"), ("FG-02", "Garden chair"), ("FG-03", "Bottle crate"),
          ("FG-04", "Basin 50cm"), ("FG-05", "Old chair range 2022"), ("FG-06", "Mould set A (obsolete)")]
    purchases, wavg, last = [], {}, {}
    for code, _ in raw:
        price, q_tot, v_tot = float(rnd.randint(900, 2400)), 0.0, 0.0
        for mth in range(1, 13, 2):
            price = r2(price * rnd.uniform(1.01, 1.06))
            qty = float(rnd.randrange(2_000, 9_000, 100))
            purchases.append([code, date(2025, mth, rnd.randint(1, 28)), qty, price, r2(qty * price)])
            q_tot += qty
            v_tot += qty * price
        wavg[code], last[code] = v_tot / q_tot, price
    rows, short, down, wa_gap, fg_value = [], 0.0, 0.0, 0.0, 0.0
    for code, desc in raw:
        qty = float(rnd.randrange(1_500, 6_000, 50))
        cost = last[code]  # P3: last price, not weighted average
        rows.append([code, desc, "Raw material", qty, qty, cost, r2(cost * 1.1), date(2025, 12, 20)])
    for i, (code, desc) in enumerate(fg):
        qty = float(rnd.randrange(300, 2_500, 10))
        cost = float(rnd.randint(1_800, 9_500))
        sell = r2(cost * 1.45)
        moved = date(2025, 12, rnd.randint(1, 28))
        if code in ("FG-05", "FG-06"):  # P2
            sell, moved = r2(cost * 0.35), date(2023, 6, 30)
        rows.append([code, desc, "Finished goods", qty, qty, cost, sell, moved])
        fg_value += qty * cost
    for r in rnd.sample(range(len(rows)), 4):  # P1: shortages
        gone = float(rnd.randint(40, 180))
        rows[r][3] = rows[r][3] - gone  # counted less than the ledger
        short += gone * rows[r][5]
    down = sum(r[3] * (r[5] - r[6]) for r in rows if r[6] < r[5])
    wa_gap = sum((r[5] - wavg[r[0]]) * r[3] for r in rows if r[0] in wavg)
    # the count fixes FG value at the counted quantities
    fg_value = sum(r[3] * r[5] for r in rows if r[2] == "Finished goods")
    ledger_value = r2(sum(r[4] * r[5] for r in rows))
    tb = balance_tb([
        ("1100", "Bank", 96_400_000.0, 0.0), ("1300", "Inventory", ledger_value, 0.0),
        ("1500", "Plant and machinery", 640_000_000.0, 0.0),
        ("2100", "Trade payables", 0.0, 71_800_000.0), ("3000", "Share capital", 0.0, 150_000_000.0),
        ("4000", "Revenue", 0.0, 1_240_000_000.0), ("5000", "Cost of sales", 812_000_000.0, 0.0),
        ("6100", "Salaries", 118_000_000.0, 0.0), ("6200", "Power and diesel", 74_500_000.0, 0.0)])
    files = {
        "Stock_Count_31Dec2025.xlsx": xlsx({"Count": [
            ["Item code", "Description", "Category", "Counted qty", "Ledger qty", "Unit cost",
             "Selling price", "Last movement"], *rows]}),
        "Raw_Material_Purchases_2025.xlsx": xlsx({"Purchases": [
            ["Item code", "Date", "Qty", "Unit price", "Amount"], *purchases]}),
        "OgunPlastics_Books_31Dec2025.xlsx": xlsx({"Trial balance": [
            ["Account code", "Account name", "Debit", "Credit"], *[list(x) for x in tb]]}),
    }
    problems = [
        Problem("P1", "Count shortages against the ledger",
                [r"count", r"short|differ|missing|less than|ledger"], r2(short), "Stock count"),
        Problem("P2", "Obsolete stock above NRV",
                [r"nrv|realisable|realizable|obsolete|slow", r"write.?down|below cost|lower of"],
                r2(down), "FG-05, FG-06"),
        Problem("P3", "Raw materials at last price, not weighted average",
                [r"weighted|average", r"cost|price|overstat|understat"], r2(abs(wa_gap)),
                "RM-01 to RM-05"),
        Problem("P4", "Raw materials and finished goods in one account",
                [r"raw material", r"finished goods", r"split|one (stock )?account|separat|class"],
                r2(fg_value), "TB 1300"),
    ]
    return Case(
        slug="manufacturer", client="Ogun Plastics Manufacturing Ltd",
        period="Year to 31 Dec 2025", files=files,
        prompts=[
            ("We make plastic buckets, chairs and crates. Here is our year-end stock count, the "
             "raw material purchases and the trial balance. The auditors always query our stock. "
             "Please check it and tell me what is wrong, with amounts."),
            "What should closing stock be?",
            "What entries do we need for stock?",
        ],
        problems=problems,
        figures={"shortage": r2(short), "nrv_writedown": r2(down), "wavg_gap": r2(wa_gap),
                 "finished_goods": r2(fg_value), "ledger_value": ledger_value},
    )

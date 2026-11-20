"""Case 5: an importer of household goods, year to 31 Dec 2025 (fictional data).

Harbour Traders Ltd imports from China and sells in Lagos. Planted, as audits find:

P1  customs duty, freight inwards and clearing charges expensed (IAS 2: part of the
    cost of the goods);
P2  USD payables left at the rates when booked, not revalued at the 31 Dec rate;
P3  letter of credit charges posted to cost of sales (a bank or finance cost);
P4  a shipment loaded on 18 Dec (FOB) that arrived on 12 Jan 2026 is not in stock
    or payables (goods in transit).
"""
from __future__ import annotations

import csv
import io
import random
from datetime import date, timedelta

from litchai.evals.cases import Case, Problem
from litchai.evals.cases.common import balance_tb, r2, xlsx


def build(seed: int = 2025) -> Case:
    rnd = random.Random(seed)
    # official rates through the year, rising (naira weakening)
    rates, day, rate = [], date(2025, 1, 2), 1480.0
    while day <= date(2025, 12, 31):
        if day.weekday() < 5:
            rate = r2(rate + rnd.uniform(-1.5, 2.2))
            rates.append((day, rate))
        day += timedelta(days=1)
    ye_rate = rates[-1][1]

    def rate_at(d: date) -> float:
        return next(v for k, v in reversed(rates) if k <= d)

    suppliers = ("Ningbo Homeware Co", "Guangzhou Kitchen Ltd", "Yiwu Plastics Co",
                 "Foshan Ceramics Ltd")
    ships = []
    for i in range(1, 11):
        bl = date(2025, rnd.randint(1, 11), rnd.randint(1, 28))
        usd = float(rnd.randrange(40_000, 160_000, 500))
        ships.append([f"SH-25{i:02d}", rnd.choice(suppliers), "FOB", bl, bl + timedelta(days=34),
                      usd, rate_at(bl), r2(usd * rate_at(bl)), "Received"])
    transit_bl = date(2025, 12, 18)
    transit_usd = 96_500.0
    ships.append(["SH-2511", "Ningbo Homeware Co", "FOB", transit_bl, date(2026, 1, 12),
                  transit_usd, rate_at(transit_bl), r2(transit_usd * rate_at(transit_bl)),
                  "In transit"])  # P4
    transit_ngn = r2(transit_usd * rate_at(transit_bl))

    # USD payables at the year end (last shipments not yet paid), at booked rates
    payables = []
    for s in ships[7:10]:
        part = r2(s[5] * rnd.choice([0.4, 0.6, 1.0]))
        payables.append([s[1], f"INV-{s[0]}", s[3], part, s[6], r2(part * s[6])])
    fx_gap = r2(sum(p[3] * ye_rate - p[5] for p in payables))  # P2

    duty = r2(sum(s[7] for s in ships[:10]) * 0.20)
    freight = r2(sum(s[5] for s in ships[:10]) * 0.08 * 1500)
    clearing = r2(len(ships[:10]) * 1_850_000)
    landed = r2(duty + freight + clearing)  # P1
    lc = r2(len(ships[:10]) * 2_400_000)  # P3

    purchases = r2(sum(s[7] for s in ships[:10]))
    tb = [("1100", "Bank", 214_600_000.0, 0.0), ("1200", "Trade receivables", 88_300_000.0, 0.0),
          ("1300", "Inventory", 156_000_000.0, 0.0),
          ("2100", "Trade payables (USD suppliers)", 0.0, r2(sum(p[5] for p in payables))),
          ("2200", "Other payables", 0.0, 12_400_000.0),
          ("3000", "Share capital", 0.0, 50_000_000.0),
          ("4000", "Revenue", 0.0, r2(purchases * 1.55)),
          ("5000", "Purchases", purchases, 0.0),
          ("5010", "Cost of sales - LC charges", lc, 0.0),
          ("6100", "Customs duty expense", duty, 0.0),
          ("6110", "Freight inwards expense", freight, 0.0),
          ("6120", "Clearing and port charges", clearing, 0.0),
          ("6200", "Salaries", 96_000_000.0, 0.0), ("6300", "Rent", 24_000_000.0, 0.0)]
    tb = balance_tb(tb)

    fx_csv = io.StringIO()
    w = csv.writer(fx_csv)
    w.writerow(["Date", "USD/NGN official rate"])
    for d, v in rates:
        w.writerow([d.isoformat(), v])
    files = {
        "Shipments_Register_2025.xlsx": xlsx({"Shipments": [
            ["Shipment no", "Supplier", "Incoterm", "B/L date", "Arrival date", "Goods value USD",
             "Rate used", "NGN value", "Status"], *ships]}),
        "USD_Supplier_Payables_31Dec2025.xlsx": xlsx({"Payables": [
            ["Supplier", "Invoice", "Invoice date", "USD amount", "Rate booked", "NGN booked"],
            *payables]}),
        "Official_FX_Rates_2025.csv": fx_csv.getvalue().encode("utf-8"),
        "Harbour_Books_31Dec2025.xlsx": xlsx({"Trial balance": [
            ["Account code", "Account name", "Debit", "Credit"], *[list(x) for x in tb]]}),
    }
    problems = [
        Problem("P1", "Duty, freight and clearing expensed instead of in the cost of stock",
                [r"duty|freight|clearing", r"stock|inventor|landed|cost of (the )?goods|ias ?2"],
                landed, "TB 6100-6120"),
        Problem("P2", "USD payables not revalued at the year-end rate",
                [r"usd|dollar|foreign|fx|exchange", r"revalu|year.?end rate|closing rate|31 dec|unrealis"],
                abs(fx_gap), "USD payables vs FX rate on 31 Dec"),
        Problem("P3", "LC charges in cost of sales",
                [r"\blc\b|letter of credit", r"financ|bank charge|reclass"], lc, "TB 5010"),
        Problem("P4", "Goods in transit (SH-2511) not recorded",
                [r"transit|sh-2511|fob|bill of lading", r"stock|inventor|payable|not (recorded|booked|in)"],
                transit_ngn, "Shipments SH-2511"),
    ]
    return Case(
        slug="importer", client="Harbour Traders Ltd", period="Year to 31 Dec 2025", files=files,
        prompts=[
            ("We import household goods from China. Here are our shipments, the dollar supplier "
             "balances, the CBN rates and the trial balance. Before the auditors come, please "
             "check the books and tell me what is wrong, with amounts."),
            "Is our stock and cost of sales right? What about the dollar balances at year end?",
            "What adjusting entries do we need?",
        ],
        problems=problems,
        figures={"landed_cost": landed, "fx_gap": fx_gap, "lc_charges": lc,
                 "transit_ngn": transit_ngn, "ye_rate": ye_rate},
    )

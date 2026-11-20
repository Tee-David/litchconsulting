"""Case 10: a fraud review of purchases, 2025 (fictional data).

Sunrise Hospitals Ltd: the board suspects the procurement officer. Planted:

P1  a duplicate vendor: "Kada Supplies Ltd" and "Kada Supplies Nig Ltd" share one
    bank account;
P2  one purchase split into three payments, each under the ₦5m approval limit;
P3  round-sum payments made on Saturdays and Sundays;
P4  three payment voucher numbers missing from the sequence;
P5  a vendor with no TIN.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from litchai.evals.cases import Case, Problem
from litchai.evals.cases.common import balance_tb, r2, xlsx

NAMES = ("Alpha Medical", "Bisola Pharma", "Crestline Labs", "Delta Linen", "Emerald Foods",
         "Fortis Diagnostics", "Golden Gas", "Harmony Cleaners", "Ivory Stationers", "Jubilee Motors",
         "Kada Supplies Ltd", "Lumen Electricals", "Meridian IT", "Novus Oxygen", "Orbit Security",
         "Pinnacle Printing", "Quantum Waste", "Royal Uniforms", "Sapphire Water", "Titan Generators")


def build(seed: int = 2025) -> Case:
    rnd = random.Random(seed)
    vendors = []
    for i, n in enumerate(NAMES, start=1):
        vendors.append([f"V{i:03d}", n, f"{rnd.randint(10**9, 10**10 - 1)}",
                        f"{rnd.randint(10_000_000, 99_999_999)}-0001"])
    kada = vendors[10]
    vendors.append(["V021", "Kada Supplies Nig Ltd", kada[2], f"{rnd.randint(10**7, 10**8 - 1)}-0001"])  # P1
    vendors.append(["V022", "Quick Fix Ventures", f"{rnd.randint(10**9, 10**10 - 1)}", ""])  # P5
    pays, pv = [], 1000
    day = date(2025, 1, 2)
    while day <= date(2025, 12, 31):
        if day.weekday() < 5:
            for _ in range(rnd.choice((1, 2, 2, 3))):
                pv += 1
                v = rnd.choice(vendors[:20])
                pays.append([f"PV{pv}", day, v[0], f"INV-{rnd.randint(1000, 9999)}",
                             float(rnd.randrange(85_000, 2_400_000, 1_250) + 370), "J. Okon"])
        day += timedelta(days=1)
    dup_pays = []
    for mth in (2, 5, 8, 11):  # payments to the duplicate record
        pv += 1
        row = [f"PV{pv}", date(2025, mth, 14), "V021", f"KS-{mth:02d}", 3_870_450.0, "J. Okon"]
        pays.append(row)
        dup_pays.append(row)
    split_day = date(2025, 6, 12)
    split = []
    for a in (4_850_000.0, 4_920_000.0, 4_700_000.0):  # P2
        pv += 1
        split.append([f"PV{pv}", split_day, "V014", f"INV-{rnd.randint(1000, 9999)}", a, "J. Okon"])
    pays += split
    weekend = []
    for d, a in ((date(2025, 3, 15), 2_000_000.0), (date(2025, 7, 20), 1_500_000.0),
                 (date(2025, 10, 4), 3_000_000.0)):  # P3 (Sat, Sun, Sat)
        pv += 1
        weekend.append([f"PV{pv}", d, "V022", f"QF-{d.month}", a, "J. Okon"])
    pays += weekend
    pays.sort(key=lambda x: int(x[0][2:]))
    planted = {id(x) for x in dup_pays + split + weekend}
    ordinary = [i for i in range(50, len(pays) - 50) if id(pays[i]) not in planted]
    gone = [pays.pop(i) for i in sorted(rnd.sample(ordinary, 3), reverse=True)]  # P4
    no_tin_paid = r2(sum(p[4] for p in pays if p[2] == "V022"))
    dup_paid = r2(sum(p[4] for p in dup_pays))
    tb = balance_tb([
        ("1100", "Bank", 188_000_000.0, 0.0), ("3000", "Share capital", 0.0, 200_000_000.0),
        ("4000", "Patient income", 0.0, 1_460_000_000.0),
        ("6100", "Medical supplies and services", r2(sum(p[4] for p in pays)), 0.0),
        ("6200", "Salaries", 520_000_000.0, 0.0)])
    files = {
        "Vendor_Master.xlsx": xlsx({"Vendors": [["Vendor ID", "Name", "Bank account", "TIN"],
                                                *vendors]}),
        "Payments_Register_2025.xlsx": xlsx({"Payments": [
            ["PV no", "Date", "Vendor ID", "Invoice no", "Amount", "Approved by"], *pays]}),
        "Procurement_Policy.txt": ("Sunrise Hospitals procurement policy (extract)\n"
                                   "Approval limit: the procurement officer may approve payments "
                                   "up to 5,000,000. Payments above 5,000,000 need the MD's "
                                   "approval.\nEvery vendor must have a TIN before payment.\n"
                                   ).encode("utf-8"),
        "Sunrise_Books_31Dec2025.xlsx": xlsx({"Trial balance": [
            ["Account code", "Account name", "Debit", "Credit"], *[list(x) for x in tb]]}),
    }
    problems = [
        Problem("P1", "Duplicate vendor Kada Supplies (same bank account)",
                [r"kada|v021", r"duplicate|same bank|share|twice"], dup_paid, "Vendor master V011/V021"),
        Problem("P2", "Purchase split under the approval limit",
                [r"split|under the (approval )?limit|below the limit", r"v014|12 jun|2025-06-12|approval"],
                r2(sum(p[4] for p in split)), "Payments 2025-06-12 V014"),
        Problem("P3", "Round sums paid at weekends",
                [r"weekend|saturday|sunday", r"round"], r2(sum(p[4] for p in weekend)), "Payments"),
        Problem("P4", "Missing payment voucher numbers",
                [r"voucher|pv", r"missing|gap|sequence"], None,
                ", ".join(g[0] for g in gone)),
        Problem("P5", "Vendor with no TIN",
                [r"tin|tax id", r"quick fix|v022|no tin|missing"], no_tin_paid, "Vendor master V022"),
    ]
    return Case(
        slug="purchases", client="Sunrise Hospitals Ltd", period="Year to 31 Dec 2025",
        files=files,
        prompts=[
            ("The board suspects our procurement officer. Here is the vendor master, every "
             "payment this year, the procurement policy and the trial balance. Please review "
             "the purchases and tell us what looks wrong, with evidence."),
            "Which vendors and payments should we look at first, and why?",
            "What should the board do next?",
        ],
        problems=problems,
        figures={"duplicate_paid": dup_paid, "split_total": r2(sum(p[4] for p in split)),
                 "weekend_total": r2(sum(p[4] for p in weekend)), "no_tin_paid": no_tin_paid,
                 "missing_vouchers": len(gone)},
    )

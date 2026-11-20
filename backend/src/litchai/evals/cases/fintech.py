"""Case 8: an agency-banking fintech, Q4 2025 (fictional data).

PayPoint Agency Services Ltd: 15,000 agent transactions settled in batches by the
processor (many transactions to one settlement). Planted:

P1  one settlement batch paid twice (the same transactions);
P2  processor fees deducted from every settlement; the books show income net;
P3  chargebacks in the transactions are not in the books;
P4  one business day (14 Nov) was never settled.
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
    agents = [f"AG{n:04d}" for n in range(1, 241)]
    days = [date(2025, 10, 1) + timedelta(days=i) for i in range(92)]
    days = [d for d in days if d.weekday() < 6]
    per_day = 15_000 // len(days) + 1
    txns, n = [], 0
    for d in days:
        for _ in range(per_day):
            if n >= 15_000:
                break
            n += 1
            kind = "Chargeback" if rnd.random() < 0.004 else rnd.choice(
                ["Withdrawal", "Transfer", "Bill payment", "Airtime"])
            amt = float(rnd.randrange(1_000, 150_000, 500))
            txns.append([f"T{n:06d}", d, rnd.choice(agents), kind, -amt if kind == "Chargeback" else amt])
    missing_day = date(2025, 11, 14)
    sets, s_no, fee_rate = [], 0, 0.006
    for d in days:
        if d == missing_day:  # P4
            continue
        day_t = [t for t in txns if t[1] == d and t[3] != "Chargeback"]
        for i in range(0, len(day_t), 40):
            batch = day_t[i:i + 40]
            s_no += 1
            gross = r2(sum(t[4] for t in batch))
            fee = r2(gross * fee_rate)
            sets.append([f"S{s_no:05d}", d + timedelta(days=1), ";".join(t[0] for t in batch),
                         gross, fee, r2(gross - fee)])
    dup = list(sets[rnd.randrange(50, len(sets) - 50)])  # P1
    s_no += 1
    dup_row = [f"S{s_no:05d}", dup[1], dup[2], dup[3], dup[4], dup[5]]
    sets.append(dup_row)
    dup_net = dup_row[5]
    fees = r2(sum(s[4] for s in sets))
    unsettled = r2(sum(t[4] for t in txns if t[1] == missing_day and t[3] != "Chargeback"))
    chargebacks = r2(sum(-t[4] for t in txns if t[3] == "Chargeback"))
    net_income = r2(sum(s[5] for s in sets) * 0.012)  # the company's margin, booked net
    tb = balance_tb([
        ("1100", "Bank", 284_600_000.0, 0.0), ("1200", "Due from processor", 12_300_000.0, 0.0),
        ("2100", "Agent float payable", 0.0, 196_000_000.0),
        ("3000", "Share capital", 0.0, 60_000_000.0),
        ("4000", "Settlement income (net)", 0.0, net_income),
        ("6100", "Salaries", 48_000_000.0, 0.0), ("6200", "Technology costs", 22_500_000.0, 0.0)])
    tx_csv = io.StringIO()
    w = csv.writer(tx_csv)
    w.writerow(["Txn ID", "Date", "Agent", "Type", "Amount"])
    for t in txns:
        w.writerow([t[0], t[1].isoformat(), t[2], t[3], f"{t[4]:.2f}"])
    st_csv = io.StringIO()
    w = csv.writer(st_csv)
    w.writerow(["Settlement ID", "Value date", "Txn IDs", "Gross", "Fee deducted", "Net settled"])
    for s in sets:
        w.writerow([s[0], s[1].isoformat(), s[2], f"{s[3]:.2f}", f"{s[4]:.2f}", f"{s[5]:.2f}"])
    files = {
        "Agent_Transactions_Q4_2025.csv": tx_csv.getvalue().encode("utf-8"),
        "Processor_Settlements_Q4_2025.csv": st_csv.getvalue().encode("utf-8"),
        "PayPoint_Books_31Dec2025.xlsx": xlsx({"Trial balance": [
            ["Account code", "Account name", "Debit", "Credit"], *[list(x) for x in tb]]}),
    }
    problems = [
        Problem("P1", "One settlement batch paid twice",
                [r"twice|duplicate|double|repeat", r"settle|batch"], dup_net, "Settlements"),
        Problem("P2", "Processor fees netted off income",
                [r"fee", r"net|gross|deduct|expense"], fees, "Settlements: Fee deducted"),
        Problem("P3", "Chargebacks not in the books",
                [r"chargeback|dispute", r"book|record|not in|missing"], chargebacks, "Transactions"),
        Problem("P4", "14 Nov never settled",
                [r"14 nov|2025-11-14|14/11|nov(ember)? 14", r"settle|missing|not|unsettled|receivable"],
                unsettled, "Transactions 2025-11-14"),
    ]
    return Case(
        slug="fintech", client="PayPoint Agency Services Ltd", period="Q4 2025 (Oct-Dec)",
        files=files,
        prompts=[
            ("We run agency banking. Here are all our agent transactions for Q4, the processor's "
             "settlement report and our trial balance. Finance says the processor still owes us "
             "money but nobody can prove it. Please reconcile and tell me what is wrong."),
            "How much does the processor really owe us at 31 December?",
            "What entries do we need?",
        ],
        problems=problems,
        figures={"duplicate": dup_net, "fees": fees, "chargebacks": chargebacks,
                 "unsettled": unsettled},
    )

"""Synthetic Nigerian bank-statement generator (Phase 2 extraction prep).

Produces realistic statement rows — POS settlements, transfers, USSD, airtime,
salary credits, Paystack settlements, bank/COT charges — with a running balance,
deterministic per seed. `messy=True` roughens the presentation (inconsistent
casing/whitespace, merged reference numbers, varied date formats, dropped
balances) to stress the future Docling extraction + pandas sanitization stages.

Extraction isn't built yet, so the immediate contract is: deterministic per seed
and (in clean mode) a self-consistent running balance.
"""
from __future__ import annotations

import argparse
import csv
import random
from dataclasses import dataclass
from pathlib import Path

_NAMES = ["ADEBAYO J", "CHINWE O", "MUSA IBRAHIM", "OKON E", "NGOZI A", "TUNDE F", "HALIMA S"]
_MERCHANTS = ["SHOPRITE", "JUMIA NG", "MTN VTU", "GLO DATA", "TOTAL FILLING", "KONGA", "GTBANK POS"]

# (template, kind) — kind is "in" or "out". {x} is filled with a name/merchant.
_CREDITS = [
    ("POS SETTLEMENT {x}", "in"),
    ("TRF FRM {x}", "in"),
    ("PAYSTACK SETTLEMENT {x}", "in"),
    ("USSD TRANSFER FRM {x}", "in"),
    ("INSTANT PAY {x}", "in"),
    ("SALARY CREDIT {x}", "in"),
]
_DEBITS = [
    ("POS PURCHASE {x}", "out"),
    ("TRF TO {x}", "out"),
    ("AIRTIME PURCHASE {x}", "out"),
    ("ATM WITHDRAWAL {x}", "out"),
    ("ELECTRICITY TOKEN {x}", "out"),
    ("USSD WITHDRAWAL {x}", "out"),
]
_CHARGES = [
    ("COT CHARGE", "out"),
    ("SMS ALERT CHARGE", "out"),
    ("ACCOUNT MAINT FEE", "out"),
    ("STAMP DUTY", "out"),
]


@dataclass
class StatementRow:
    date: str
    description: str
    money_in: float
    money_out: float
    balance: float | None


@dataclass
class Statement:
    account_name: str
    opening_balance: float
    rows: list[StatementRow]


def _messy_text(rng: random.Random, text: str) -> str:
    transform = rng.choice([str.upper, str.lower, str.title, lambda s: s])
    text = transform(text)
    if rng.random() < 0.4:
        text = text.replace(" ", "  ", 1)  # stray double space
    if rng.random() < 0.5:
        text = f"{text} /REF{rng.randint(10_000, 99_999)}"  # merged reference number
    return text


def _fmt_date(rng: random.Random, year: int, month: int, day: int, messy: bool) -> str:
    if messy and rng.random() < 0.5:
        import datetime

        return datetime.date(year, month, day).strftime("%d-%b-%Y").upper()
    return f"{year:04d}-{month:02d}-{day:02d}"


def generate_statement(seed: int, months: int = 3, messy: bool = False) -> Statement:
    rng = random.Random(seed)
    account_name = rng.choice(_NAMES) + " ENTERPRISES"
    balance = float(rng.randint(200_000, 2_000_000))
    opening = balance
    rows: list[StatementRow] = []

    for m in range(months):
        month = 1 + m
        n = rng.randint(8, 18)
        days = sorted(rng.randint(1, 28) for _ in range(n))
        for day in days:
            roll = rng.random()
            if roll < 0.4:
                template, _ = rng.choice(_CREDITS)
                amount = round(rng.uniform(20_000, 2_000_000), 2)
                money_in, money_out = amount, 0.0
                balance += amount
            elif roll < 0.9:
                template, _ = rng.choice(_DEBITS)
                amount = round(rng.uniform(1_000, 500_000), 2)
                money_in, money_out = 0.0, amount
                balance -= amount
            else:
                template, _ = rng.choice(_CHARGES)
                amount = round(rng.uniform(10, 5_000), 2)
                money_in, money_out = 0.0, amount
                balance -= amount

            filler = rng.choice(_NAMES + _MERCHANTS)
            description = template.format(x=filler) if "{x}" in template else template
            shown_balance: float | None = round(balance, 2)
            if messy:
                description = _messy_text(rng, description)
                if rng.random() < 0.2:
                    shown_balance = None  # dropped balance
            rows.append(
                StatementRow(
                    _fmt_date(rng, 2026, month, day, messy),
                    description,
                    money_in,
                    money_out,
                    shown_balance,
                )
            )

    return Statement(account_name=account_name, opening_balance=opening, rows=rows)


def to_csv(statement: Statement, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["Date", "Description", "Money In", "Money Out", "Balance"])
        for r in statement.rows:
            writer.writerow([
                r.date,
                r.description,
                f"{r.money_in:.2f}" if r.money_in else "",
                f"{r.money_out:.2f}" if r.money_out else "",
                "" if r.balance is None else f"{r.balance:.2f}",
            ])


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a synthetic Nigerian bank statement.")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--months", type=int, default=3)
    parser.add_argument("--messy", action="store_true")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "fixtures" / "synthetic" / "statements",
    )
    args = parser.parse_args()
    statement = generate_statement(args.seed, args.months, args.messy)
    suffix = "messy" if args.messy else "clean"
    path = args.out / f"statement_seed{args.seed}_{suffix}.csv"
    to_csv(statement, path)
    print(f"Wrote {len(statement.rows)} rows to {path}")


if __name__ == "__main__":
    main()

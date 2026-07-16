"""Articulation + cutoff rules (Phase 4).

Statements must articulate across periods: this period's **opening** balances are
last period's approved **closing** balances. Deviations are surfaced as
restatements — never silently absorbed. Also validates cutoff: transactions dated
outside the engagement period are flagged (they belong to another period).

Pure functions over prior/current figures; the reviewer sees the flags.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

TOLERANCE = 0.01


@dataclass(frozen=True)
class PriorPeriod:
    closing_cash: float
    retained_earnings: float
    profit: float          # prior-period profit
    dividends: float       # prior-period dividends
    ppe_nbv: float


@dataclass(frozen=True)
class CurrentOpenings:
    opening_cash: float
    opening_retained_earnings: float
    opening_ppe_nbv: float


@dataclass(frozen=True)
class ArticulationBreak:
    figure: str
    expected: float
    actual: float
    message: str

    @property
    def delta(self) -> float:
        return round(self.actual - self.expected, 2)


def check_articulation(prior: PriorPeriod, current: CurrentOpenings) -> list[ArticulationBreak]:
    breaks: list[ArticulationBreak] = []

    def _cmp(figure: str, expected: float, actual: float) -> None:
        if abs(actual - expected) > TOLERANCE:
            breaks.append(
                ArticulationBreak(
                    figure, expected, actual,
                    f"{figure}: opens at ₦{actual:,.2f} but prior close implies ₦{expected:,.2f} "
                    f"(restatement of ₦{actual - expected:,.2f})",
                )
            )

    _cmp("cash", prior.closing_cash, current.opening_cash)
    # RE opening = prior RE + prior profit − prior dividends.
    _cmp(
        "retained_earnings",
        prior.retained_earnings + prior.profit - prior.dividends,
        current.opening_retained_earnings,
    )
    _cmp("ppe_nbv", prior.ppe_nbv, current.opening_ppe_nbv)
    return breaks


@dataclass(frozen=True)
class CutoffBreak:
    line_item_id: int
    txn_date: date
    message: str


def check_cutoff(
    lines: list[tuple[int, date | None]], period_start: date, period_end: date
) -> list[CutoffBreak]:
    """Flag line items dated outside [period_start, period_end]."""
    out: list[CutoffBreak] = []
    for line_item_id, txn_date in lines:
        if txn_date is None:
            continue
        if txn_date < period_start or txn_date > period_end:
            out.append(
                CutoffBreak(
                    line_item_id, txn_date,
                    f"Transaction dated {txn_date.isoformat()} is outside the period "
                    f"{period_start.isoformat()}–{period_end.isoformat()}",
                )
            )
    return out

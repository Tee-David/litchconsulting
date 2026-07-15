"""Balance-continuity validation (Phase 2b extraction gate).

``opening + Σ(signed amounts up to row i) == balance_i`` for every row that
carries a running balance. A mismatch localizes an OCR digit error to the exact
row — deterministic, zero LLM tokens — which is why this beats ensemble voting
for financial documents (PRD decision 12). The computed running total (from the
trusted transaction amounts) is kept as ground truth, so a lone misread
*balance* cell flags exactly one row, while a misread *amount* surfaces as a
cascade whose **first** break is the culprit row.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from litchai.extraction.base import ExtractionResult

TOLERANCE = Decimal("0.00")


@dataclass(frozen=True)
class ContinuityBreak:
    row_index: int
    expected: Decimal      # opening + running signed sum
    actual: Decimal        # the balance the statement printed
    sheet_ref: str | None
    row_ref: int | None

    @property
    def delta(self) -> Decimal:
        return self.actual - self.expected


@dataclass(frozen=True)
class ContinuityReport:
    checked: bool          # False if there was no balance column to validate against
    ok: bool
    opening: Decimal | None
    closing_expected: Decimal | None
    breaks: list[ContinuityBreak] = field(default_factory=list)


def check_continuity(result: ExtractionResult, tolerance: Decimal = TOLERANCE) -> ContinuityReport:
    rows = result.rows
    balanced_rows = [r for r in rows if r.balance is not None]
    if not balanced_rows:
        return ContinuityReport(checked=False, ok=True, opening=result.opening_balance,
                                closing_expected=None)

    opening = result.opening_balance
    if opening is None:
        # Infer from the first row with a balance: opening = balance - Σ amounts up to it.
        first_idx = next(i for i, r in enumerate(rows) if r.balance is not None)
        run = sum((r.amount for r in rows[: first_idx + 1]), Decimal("0.00"))
        opening = rows[first_idx].balance - run

    running = opening
    breaks: list[ContinuityBreak] = []
    for i, row in enumerate(rows):
        running += row.amount
        if row.balance is None:
            continue
        if abs(running - row.balance) > tolerance:
            breaks.append(ContinuityBreak(i, running, row.balance, row.sheet_ref, row.row_ref))
            # running stays on the amount-derived track (ground truth), so a lone
            # bad balance flags one row; a bad amount cascades from its culprit.

    closing_ok = (
        result.closing_balance is None
        or abs(running - result.closing_balance) <= tolerance
    )
    return ContinuityReport(
        checked=True,
        ok=not breaks and closing_ok,
        opening=opening,
        closing_expected=running,
        breaks=breaks,
    )

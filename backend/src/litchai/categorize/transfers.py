"""Internal-transfer pairing (Phase 3).

A client moving money between their own accounts produces an ``out`` leg on one
statement and an ``in`` leg on another — same amount, within a few days. Left
unpaired these double-count as an expense and income. This proposes
``transfers.internal`` pairs (same amount, different account, within ±N days);
legs a caller marked as transfer candidates but that find no partner are
returned unmatched (a reviewer flag). Nothing is auto-reclassified — proposals
only.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class TransferLeg:
    index: int
    account: str | None
    direction: str          # 'in' | 'out'
    amount: Decimal
    txn_date: date | None
    is_candidate: bool = False   # narration suggests an internal transfer (e.g. "TRF TO OWN")


@dataclass(frozen=True)
class TransferPair:
    out_index: int
    in_index: int
    amount: Decimal
    day_gap: int


def pair_internal_transfers(
    legs: list[TransferLeg], *, max_days: int = 3
) -> tuple[list[TransferPair], list[int]]:
    outs = [leg for leg in legs if leg.direction == "out"]
    ins = [leg for leg in legs if leg.direction == "in"]
    used_in: set[int] = set()
    pairs: list[TransferPair] = []

    for out in outs:
        best: TransferLeg | None = None
        best_gap = max_days + 1
        for inc in ins:
            if inc.index in used_in:
                continue
            if inc.amount != out.amount or inc.account == out.account:
                continue
            gap = _day_gap(out.txn_date, inc.txn_date)
            if gap is None or gap > max_days:
                continue
            if gap < best_gap:
                best, best_gap = inc, gap
        if best is not None:
            used_in.add(best.index)
            pairs.append(TransferPair(out.index, best.index, out.amount, best_gap))

    paired_indices = {i for p in pairs for i in (p.out_index, p.in_index)}
    unmatched = [leg.index for leg in legs if leg.is_candidate and leg.index not in paired_indices]
    return pairs, unmatched


def _day_gap(a: date | None, b: date | None) -> int | None:
    if a is None or b is None:
        return 0  # undated legs can still pair on amount+account
    return abs((a - b).days)

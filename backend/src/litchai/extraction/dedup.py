"""Transaction dedup + statement-overlap detection (Phase 2b).

Two protections against double-counting when a client sends overlapping exports:

* **Row dedup** — a fuzzy key ``(account, date, amount, normalized narration)``
  groups suspected duplicates. They are marked ``needs_review``, **never**
  auto-dropped (a client can legitimately pay the same vendor the same amount
  twice a day).
* **Statement overlap** — per-account period-coverage tracking; two statements
  whose date ranges intersect are a hard flag for the reviewer.

Pure functions over minimal inputs so the pipeline and tests share them.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from litchai.categorize import normalize_narration


@dataclass(frozen=True)
class DupTxn:
    index: int
    account: str | None
    txn_date: date | None
    amount: Decimal
    raw_text: str


def dedup_key(txn: DupTxn) -> tuple:
    return (txn.account, txn.txn_date, txn.amount, normalize_narration(txn.raw_text))


def find_duplicate_groups(txns: list[DupTxn]) -> list[list[int]]:
    """Return groups (of indices) sharing a dedup key, size ≥ 2 — the review
    suspects. First occurrence stays; the rest are the flagged repeats, but the
    caller decides — nothing is dropped here."""
    buckets: dict[tuple, list[int]] = {}
    for txn in txns:
        buckets.setdefault(dedup_key(txn), []).append(txn.index)
    return [sorted(idxs) for idxs in buckets.values() if len(idxs) > 1]


def duplicate_suspect_indices(txns: list[DupTxn]) -> set[int]:
    """Indices to mark ``needs_review`` — every member past the first in a group."""
    return {i for group in find_duplicate_groups(txns) for i in group[1:]}


@dataclass(frozen=True)
class Coverage:
    document_id: int
    account: str | None
    start: date
    end: date


@dataclass(frozen=True)
class Overlap:
    a: int
    b: int
    account: str | None
    start: date  # overlapping window
    end: date


def detect_statement_overlap(coverages: list[Coverage]) -> list[Overlap]:
    """All pairs of same-account statements whose date ranges intersect."""
    overlaps: list[Overlap] = []
    for i in range(len(coverages)):
        for j in range(i + 1, len(coverages)):
            a, b = coverages[i], coverages[j]
            if a.account != b.account:
                continue
            start, end = max(a.start, b.start), min(a.end, b.end)
            if start <= end:
                overlaps.append(Overlap(a.document_id, b.document_id, a.account, start, end))
    return overlaps

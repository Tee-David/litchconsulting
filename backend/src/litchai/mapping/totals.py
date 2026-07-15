"""CategoryTotals — the trial-balance-like intermediate representation.

One deterministic aggregation pass over categorized line items feeds every
statement, so P&L, SOFP, SOCF and the schedules can never disagree about a
number. `net` is the signed cash view (inflows positive); presentation signs
are applied by the bindings, not here.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from litchai.taxonomy import Taxonomy


class MappingError(ValueError):
    pass


@dataclass(frozen=True)
class LineItemRow:
    """Minimal categorized-line shape (the Phase 2 `line_items` table row)."""

    id: int
    category_code: str
    direction: Literal["in", "out"]
    amount: float


@dataclass(frozen=True)
class CategoryTotal:
    code: str
    inflow: float
    outflow: float
    net: float  # inflow - outflow
    line_item_ids: tuple[int, ...]


CategoryTotals = dict[str, CategoryTotal]


def aggregate(line_items: Sequence[LineItemRow], taxonomy: Taxonomy) -> CategoryTotals:
    by_code = taxonomy.by_code()
    buckets: dict[str, list[LineItemRow]] = {}
    for item in line_items:
        category = by_code.get(item.category_code)
        if category is None:
            raise MappingError(f"line item {item.id} has unknown category {item.category_code!r}")
        if not category.postable:
            raise MappingError(
                f"line item {item.id} posted to non-postable {item.category_code!r}"
            )
        if item.amount < 0:
            raise MappingError(
                f"line item {item.id} has negative amount; direction carries the sign"
            )
        buckets.setdefault(item.category_code, []).append(item)

    totals: CategoryTotals = {}
    for code, items in buckets.items():
        inflow = sum(i.amount for i in items if i.direction == "in")
        outflow = sum(i.amount for i in items if i.direction == "out")
        totals[code] = CategoryTotal(
            code=code,
            inflow=inflow,
            outflow=outflow,
            net=inflow - outflow,
            line_item_ids=tuple(i.id for i in items),
        )
    return totals


def uncategorized_ids(totals: CategoryTotals, suspense_code: str) -> Iterable[int]:
    entry = totals.get(suspense_code)
    return entry.line_item_ids if entry else ()

"""Recompile diff (Phase 4) — "what changed since the approved draft".

When a late document reopens an approved engagement, the reviewer needs a
draft-vs-draft diff, not a re-review from scratch. This compares two figure sets
(the approved snapshot vs the new draft) and reports only what moved. Pure and
deterministic; works over a ``{figure: amount}`` map, which the mapping layer's
``CategoryTotals`` reduces to via :func:`totals_to_figures`.
"""
from __future__ import annotations

from dataclasses import dataclass

TOLERANCE = 0.01


@dataclass(frozen=True)
class FigureDiff:
    figure: str
    old: float | None
    new: float | None
    kind: str  # "changed" | "added" | "removed"

    @property
    def delta(self) -> float:
        return round((self.new or 0.0) - (self.old or 0.0), 2)


def diff_figures(
    old: dict[str, float], new: dict[str, float], *, tolerance: float = TOLERANCE
) -> list[FigureDiff]:
    diffs: list[FigureDiff] = []
    for figure in sorted(set(old) | set(new)):
        o, n = old.get(figure), new.get(figure)
        if o is None:
            diffs.append(FigureDiff(figure, None, n, "added"))
        elif n is None:
            diffs.append(FigureDiff(figure, o, None, "removed"))
        elif abs(n - o) > tolerance:
            diffs.append(FigureDiff(figure, o, n, "changed"))
    return diffs


def totals_to_figures(totals) -> dict[str, float]:
    """Reduce a mapping-layer ``CategoryTotals`` to ``{category_code: net}``."""
    return {code: total.net for code, total in totals.items()}

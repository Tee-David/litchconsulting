"""Per-figure lineage + confidence rollup (Phase 4).

Turns the mapping layer's line-item→figure sidecar into the ReviewPack line
"Revenue ← 142 items: 92 exact / 41 memory / 9 LLM, min conf 0.78" — so a
reviewer sees, per statement figure, how it was built and where the weakest
evidence is. Deterministic; no AI.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass


@dataclass(frozen=True)
class LineageLine:
    """Minimal categorized line the rollup reads (a subset of the DB row)."""

    line_item_id: int
    category_source: str | None  # exact | trigram | vector | llm | human | None
    confidence: float | None


@dataclass(frozen=True)
class FigureLineage:
    figure: str
    item_count: int
    by_source: dict[str, int]
    min_confidence: float | None
    review_worthy: int          # llm / suspense / unresolved contributions

    def summary(self) -> str:
        parts = ", ".join(f"{n} {src}" for src, n in sorted(self.by_source.items()))
        conf = f", min conf {self.min_confidence:.2f}" if self.min_confidence is not None else ""
        return f"{self.figure} ← {self.item_count} items: {parts}{conf}"


# Memory-derived sources collapse to "memory" in the human-facing summary.
_SOURCE_LABEL = {
    "exact": "exact", "trigram": "memory", "vector": "memory",
    "llm": "LLM", "human": "human", None: "unresolved",
}
_REVIEW_WORTHY = {"llm", None}


def rollup_figure(figure: str, lines: list[LineageLine]) -> FigureLineage:
    by_source: Counter[str] = Counter()
    confidences: list[float] = []
    review_worthy = 0
    for line in lines:
        by_source[_SOURCE_LABEL.get(line.category_source, "memory")] += 1
        if line.confidence is not None:
            confidences.append(line.confidence)
        if line.category_source in _REVIEW_WORTHY:
            review_worthy += 1
    return FigureLineage(
        figure=figure,
        item_count=len(lines),
        by_source=dict(by_source),
        min_confidence=min(confidences) if confidences else None,
        review_worthy=review_worthy,
    )


def rollup_all(figure_to_lines: dict[str, list[LineageLine]]) -> list[FigureLineage]:
    return [rollup_figure(figure, lines) for figure, lines in figure_to_lines.items()]

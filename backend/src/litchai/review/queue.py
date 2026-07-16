"""Risk-based review queue (Phase 4).

The reviewer's attention is the scarcest resource, so items are ordered by
``amount × (1 − confidence) × novelty``, not document order — big, uncertain,
unfamiliar lines float to the top. Novelty defaults from how the line was
resolved (an LLM/suspense line is more novel than an exact-memory hit) and how
often its narration recurs in the batch.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

# How "new" a resolution source is (1 = never seen it decide before).
_SOURCE_NOVELTY = {
    "exact": 0.1,
    "trigram": 0.3,
    "vector": 0.5,
    "llm": 0.9,
    "human": 0.0,
    None: 1.0,     # unresolved → suspense
}


@dataclass(frozen=True)
class ReviewItem:
    line_item_id: int
    normalized_text: str
    amount: float
    confidence: float
    source: str | None
    needs_review: bool


@dataclass(frozen=True)
class RankedReviewItem:
    item: ReviewItem
    risk: float
    novelty: float


def novelty(source: str | None, occurrences: int) -> float:
    """Blend source-novelty with rarity in the batch (a one-off is more novel
    than a narration that appears 30 times)."""
    base = _SOURCE_NOVELTY.get(source, 0.7)
    rarity = 1.0 / occurrences if occurrences > 0 else 1.0
    return round(0.5 * base + 0.5 * rarity, 4)


def rank_review_queue(items: list[ReviewItem], *, only_flagged: bool = True) -> list[RankedReviewItem]:
    counts = Counter(i.normalized_text for i in items)
    ranked: list[RankedReviewItem] = []
    for item in items:
        if only_flagged and not item.needs_review:
            continue
        nov = novelty(item.source, counts[item.normalized_text])
        risk = round(item.amount * (1.0 - item.confidence) * nov, 2)
        ranked.append(RankedReviewItem(item=item, risk=risk, novelty=nov))
    ranked.sort(key=lambda r: r.risk, reverse=True)
    return ranked

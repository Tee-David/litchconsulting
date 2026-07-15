"""Learning reports (Phase 3) — per-rung hit rates, confusions, warm-ness.

Pure aggregators over ``categorization_events`` rows (dicts) so they're testable;
the matching SQL for the VM lives in :data:`SQL_VIEWS` for the observability page.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass


@dataclass(frozen=True)
class RungHitRate:
    rung: int
    seen: int
    accepted: int

    @property
    def hit_rate(self) -> float:
        return self.accepted / self.seen if self.seen else 0.0


def rung_hit_rates(events: list[dict]) -> list[RungHitRate]:
    seen: Counter[int] = Counter()
    accepted: Counter[int] = Counter()
    for e in events:
        seen[e["rung"]] += 1
        if e.get("accepted"):
            accepted[e["rung"]] += 1
    return [RungHitRate(r, seen[r], accepted[r]) for r in sorted(seen)]


def fallback_rate(events: list[dict]) -> float:
    """Share of *decisions* that fell through to rung 4. Counts one terminal
    event per line item (the max rung reached)."""
    by_item: dict[int, int] = {}
    for e in events:
        key = e.get("line_item_id", id(e))
        by_item[key] = max(by_item.get(key, 0), e["rung"])
    if not by_item:
        return 0.0
    return sum(1 for r in by_item.values() if r >= 4) / len(by_item)


# VM: plain SQL over the events/telemetry tables for the observability page.
SQL_VIEWS = {
    "rung_hit_rates": """
        SELECT rung, count(*) AS seen, count(*) FILTER (WHERE accepted) AS accepted,
               round(avg(accepted::int), 3) AS hit_rate
        FROM categorization_events GROUP BY rung ORDER BY rung
    """,
    "most_corrected_categories": """
        SELECT new_value AS category_code, count(*) AS corrections
        FROM corrections WHERE field_changed = 'category_code'
        GROUP BY new_value ORDER BY corrections DESC LIMIT 20
    """,
    "still_confusing_narrations": """
        SELECT normalized_text, count(*) AS reviews
        FROM categorization_events WHERE rung IN (0, 4)
        GROUP BY normalized_text ORDER BY reviews DESC LIMIT 50
    """,
    "llm_usage": """
        SELECT date_trunc('day', created_at) AS day, count(*) AS calls,
               count(*) FILTER (WHERE cache_hit) AS cache_hits,
               round(avg(latency_ms)) AS avg_latency_ms
        FROM ai_calls GROUP BY day ORDER BY day DESC
    """,
}

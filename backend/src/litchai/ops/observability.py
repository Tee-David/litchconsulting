"""Observability metrics (Phase 6) — plain aggregation for the admin page.

Pure summarizers over the pipeline's own rows so they're testable; the VM page
runs the same shape via :data:`litchai.categorize.reports.SQL_VIEWS` over the
events/telemetry tables (documents processed, per-rung hit rates, review rates,
LLM usage, failure reasons, compile times).
"""
from __future__ import annotations

from collections import Counter
from typing import Any

from litchai.categorize.reports import fallback_rate, rung_hit_rates


def document_status_counts(documents: list) -> dict[str, int]:
    return dict(Counter(d.status for d in documents))


def summarize(documents: list, events: list[dict[str, Any]]) -> dict[str, Any]:
    statuses = document_status_counts(documents)
    review_flagged = sum(int((d.progress or {}).get("needs_review", 0) or 0) for d in documents)
    return {
        "documents_total": len(documents),
        "documents_by_status": statuses,
        "documents_rejected": statuses.get("rejected", 0),
        "needs_review_total": review_flagged,
        "rung_hit_rates": [
            {"rung": r.rung, "seen": r.seen, "accepted": r.accepted, "hit_rate": r.hit_rate}
            for r in rung_hit_rates(events)
        ],
        "rung4_fallback_rate": fallback_rate(events),
    }

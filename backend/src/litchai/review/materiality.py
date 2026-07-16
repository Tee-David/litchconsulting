"""Materiality-scaled anomalies (Phase 4).

An engagement carries a materiality figure; anomaly thresholds scale to it so a
₦5,000 wobble on a ₦2bn set isn't noise while the same wobble on a ₦50k set is
real. Re-grades :class:`~litchai.review.facts.Anomaly` objects by amount relative
to materiality — below it drops to ``info``, well above stays/raises to ``high``.
"""
from __future__ import annotations

from dataclasses import replace

from litchai.review.facts import Anomaly

# Multiples of materiality that map to a severity floor.
_HIGH_MULTIPLE = 1.0    # ≥ materiality → at least "warning"; ≥ 3× → "high"
_HIGH_HARD = 3.0


def apply_materiality(anomalies: list[Anomaly], materiality: float | None) -> list[Anomaly]:
    """Re-grade amount-bearing anomalies against materiality. Structural checks
    that don't tie out (no amount, or a ``*_check``/reconcile code) are never
    downgraded — a balance that doesn't balance is always high."""
    if not materiality or materiality <= 0:
        return anomalies
    out: list[Anomaly] = []
    for anomaly in anomalies:
        if anomaly.amount is None or _is_structural(anomaly):
            out.append(anomaly)
            continue
        magnitude = abs(anomaly.amount)
        if magnitude < materiality * _HIGH_MULTIPLE:
            out.append(replace(anomaly, severity="info"))
        elif magnitude >= materiality * _HIGH_HARD:
            out.append(replace(anomaly, severity="high"))
        else:
            out.append(replace(anomaly, severity="warning"))
    return out


_STRUCTURAL_CODES = {"does_not_reconcile", "check_not_zero", "nonpositive_net"}


def _is_structural(anomaly: Anomaly) -> bool:
    return anomaly.code in _STRUCTURAL_CODES

"""Idle-reclaim heartbeat (Phase 6).

OCI reclaims an Always-Free VM whose 95th-percentile CPU/network/memory sits
below its thresholds. A light, bounded periodic burst + a DB round-trip keeps the
box above the floor. Runs from a systemd timer that defers ``litchai.heartbeat``
(see ``deploy/litchai-heartbeat.*``); the utilization is then monitored over 7
days (checklist).
"""
from __future__ import annotations

import time


def heartbeat_burst(ms: int = 200) -> int:
    """A tiny bounded CPU burst (default 200ms). Returns the iteration count so
    a caller can log that it actually ran."""
    end = time.monotonic() + ms / 1000.0
    n = 0
    while time.monotonic() < end:
        n += 1
    return n

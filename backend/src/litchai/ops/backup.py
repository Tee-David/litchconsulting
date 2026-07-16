"""Backup retention/rotation (Phase 6).

The nightly ``pg_dump`` + Cloudflare R2 push runs from ``deploy/backup.sh`` on a
systemd timer (R2 upload needs credentials — VM only). The grandfather-father-son
retention policy lives here, pure and tested, so pruning old dumps is
deterministic: keep the last N dailies, then one per week, then one per month.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class RetentionPolicy:
    keep_daily: int = 7
    keep_weekly: int = 4
    keep_monthly: int = 6


def _keep(dates: list[date], today: date, policy: RetentionPolicy) -> set[date]:
    ordered = sorted(dates, reverse=True)
    keep: set[date] = set()

    daily_cutoff = today - timedelta(days=policy.keep_daily)
    keep |= {d for d in ordered if d > daily_cutoff}

    seen_weeks: set[tuple[int, int]] = set()
    for d in ordered:
        if d > daily_cutoff:
            continue
        wk = d.isocalendar()[:2]
        if wk not in seen_weeks and len(seen_weeks) < policy.keep_weekly:
            seen_weeks.add(wk)
            keep.add(d)

    seen_months: set[tuple[int, int]] = set()
    for d in ordered:
        if d > daily_cutoff:
            continue
        m = (d.year, d.month)
        if m not in seen_months and len(seen_months) < policy.keep_monthly:
            seen_months.add(m)
            keep.add(d)

    return keep


def select_for_deletion(
    backup_dates: list[date], today: date, policy: RetentionPolicy | None = None
) -> list[date]:
    """Backups to prune under the retention policy (everything not kept)."""
    policy = policy or RetentionPolicy()
    keep = _keep(backup_dates, today, policy)
    return sorted(set(backup_dates) - keep)

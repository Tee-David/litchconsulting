"""Daily spend cap for a paid model (DeepSeek), measured from the real balance.

DeepSeek reports the account balance (GET /user/balance). Spend today = the balance
at the start of the UTC day minus the balance now (a top-up resets the start). Above
the cap, the router skips every DeepSeek slot until the next day and the free chain
(Groq, Cloudflare) answers. The cap is a setting the firm can change in the app
(``ai_setting``), with the env ``LITCHAI_DEEPSEEK_DAILY_USD`` (default 1.00) as the
first value. Balance checks are cached for a minute, so a turn costs no extra call.
"""
from __future__ import annotations

import os
import threading
import time
from datetime import UTC, datetime
from typing import Any

CAP_KEY = "deepseek_daily_usd"
BASE_KEY = "deepseek_day_start"
PEAK_KEY = "deepseek_credit_peak"  # the balance after the last top-up (for "credit used %")
CHECK_EVERY = 60.0


class MemorySettings:
    def __init__(self) -> None:
        self.data: dict[str, Any] = {}

    def get(self, key: str) -> Any:
        return self.data.get(key)

    def put(self, key: str, value: Any) -> None:
        self.data[key] = value


class PgSettings:
    """``ai_setting`` (key text PK, value jsonb), one short connection per call."""

    def __init__(self) -> None:
        self._mem = MemorySettings()

    def _conn(self) -> Any:
        from litchai.db.pg import connect

        return connect()

    def get(self, key: str) -> Any:
        try:
            conn = self._conn()
        except Exception:  # noqa: BLE001 — DB down: keep working from memory
            return self._mem.get(key)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT value FROM ai_setting WHERE key = %s", (key,))
                row = cur.fetchone()
            return row["value"] if row else self._mem.get(key)
        except Exception:  # noqa: BLE001
            return self._mem.get(key)
        finally:
            conn.close()

    def put(self, key: str, value: Any) -> None:
        self._mem.put(key, value)
        try:
            conn = self._conn()
        except Exception:  # noqa: BLE001
            return
        try:
            from psycopg.types.json import Jsonb

            with conn.cursor() as cur:
                cur.execute("INSERT INTO ai_setting (key, value, updated_at) VALUES (%s, %s, now()) "
                            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "
                            "updated_at = now()", (key, Jsonb(value)))
            conn.commit()
        except Exception:  # noqa: BLE001
            pass
        finally:
            conn.close()


def _fetch_balance(base_url: str, key: str) -> float | None:
    import httpx

    root = base_url.removesuffix("/v1").rstrip("/")
    try:
        r = httpx.get(f"{root}/user/balance", headers={"Authorization": f"Bearer {key}"},
                      timeout=8.0)
        infos = r.json().get("balance_infos") or []
        usd = next((i for i in infos if i.get("currency") == "USD"), infos[0] if infos else None)
        return float(usd["total_balance"]) if usd else None
    except Exception:  # noqa: BLE001 — unknown balance: never block on it
        return None


class SpendCap:
    def __init__(self, *, base_url: str, api_key: str | None, settings: Any | None = None,
                 fetch: Any = None, clock: Any = time.monotonic) -> None:
        self.base_url, self.api_key = base_url, api_key
        self.settings = settings or MemorySettings()
        self.fetch = fetch or _fetch_balance
        self.clock = clock
        self._lock = threading.Lock()
        self._last: tuple[float, dict[str, Any]] | None = None

    def cap(self) -> float:
        v = self.settings.get(CAP_KEY)
        if v is None:
            v = os.environ.get("LITCHAI_DEEPSEEK_DAILY_USD") or 1.0
        try:
            return max(0.0, float(v))
        except (TypeError, ValueError):
            return 1.0

    def set_cap(self, usd: float) -> None:
        self.settings.put(CAP_KEY, round(max(0.0, float(usd)), 2))
        self._last = None

    def status(self, force: bool = False) -> dict[str, Any]:
        """{balance, spent_today, cap, over}. ``over`` is False when unknown."""
        with self._lock:
            now = self.clock()
            if not force and self._last and now - self._last[0] < CHECK_EVERY:
                return self._last[1]
            cap = self.cap()
            bal = self.fetch(self.base_url, self.api_key) if self.api_key else None
            day = datetime.now(UTC).date().isoformat()
            spent = None
            if bal is not None:
                start = self.settings.get(BASE_KEY) or {}
                if start.get("day") != day or bal > float(start.get("balance", 0)):
                    start = {"day": day, "balance": bal}  # new day, or a top-up
                    self.settings.put(BASE_KEY, start)
                spent = round(max(0.0, float(start["balance"]) - bal), 4)
                peak = self.settings.get(PEAK_KEY)
                if peak is None or bal > float(peak):
                    peak = bal  # first reading, or a top-up
                    self.settings.put(PEAK_KEY, peak)
                credit_used_pct = round(100 * (float(peak) - bal) / float(peak), 1) if peak else None
            else:
                credit_used_pct = None
            out = {"balance": bal, "spent_today": spent, "cap": cap,
                   "over": spent is not None and spent >= cap,
                   "credit_used_pct": credit_used_pct}
            self._last = (now, out)
            return out

    def public(self, force: bool = False) -> dict[str, Any]:
        """What the app may show: today's spend and the cap. Never the balance
        (Tee-David, 18 Nov 2026)."""
        s = self.status(force)
        return {"spent_today": s["spent_today"], "cap": s["cap"], "over": s["over"],
                "credit_used_pct": s["credit_used_pct"]}

    def over(self) -> bool:
        return bool(self.status()["over"])

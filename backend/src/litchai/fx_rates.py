"""CBN official exchange rates (v8, limit 2.2): a trusted live source, cited by date.

The Central Bank of Nigeria publishes its rates as JSON at
https://www.cbn.gov.ng/api/GetAllExchangeRates (every currency, every day, buying,
central and selling). A daily job (``python -m litchai.fx_rates refresh``, the
litch-fx-rates timer) keeps a compact copy under the storage folder. Tools read the
copy only, so a turn never waits on the CBN site, and no client data leaves the VM.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

URL = "https://www.cbn.gov.ng/api/GetAllExchangeRates"
SOURCE = "CBN official exchange rate (cbn.gov.ng)"

# CBN names to ISO codes (the names the feed uses)
CODES = {
    "US DOLLAR": "USD", "POUNDS STERLING": "GBP", "EURO": "EUR", "YUAN/RENMINBI": "CNY",
    "SWISS FRANC": "CHF", "YEN": "JPY", "CFA": "XOF", "WAUA": "WAUA", "RIYAL": "SAR",
    "SOUTH AFRICAN RAND": "ZAR", "DANISH KRONA": "DKK", "CANADIAN DOLLAR": "CAD",
    "SDR": "XDR", "AUSTRALIAN DOLLAR": "AUD", "UAE DIRHAM": "AED", "INDIAN RUPEE": "INR",
}


def _path() -> Path:
    from litchai.storage import DEFAULT_ROOT

    return Path(os.environ.get("LITCHAI_STORAGE_DIR", DEFAULT_ROOT)) / "fx" / "cbn.json"


def _num(v: Any) -> float | None:
    try:
        return round(float(str(v).replace(",", "")), 4)
    except (TypeError, ValueError):
        return None


def compact(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """{"updated": iso, "rates": {code: {date: [buying, central, selling]}}}"""
    rates: dict[str, dict[str, list[float | None]]] = {}
    for r in rows:
        name = str(r.get("currency") or "").strip().upper()
        code = CODES.get(name) or name
        day = str(r.get("ratedate") or "")[:10]
        if not code or len(day) != 10:
            continue
        rates.setdefault(code, {})[day] = [_num(r.get("buyingrate")), _num(r.get("centralrate")),
                                           _num(r.get("sellingrate"))]
    return {"updated": datetime.now(UTC).isoformat(timespec="seconds"), "rates": rates}


def refresh(fetch: Any = None, path: Path | None = None) -> dict[str, Any]:
    """Download the CBN feed and keep the compact copy. ``fetch`` is for tests."""
    if fetch is None:
        import httpx

        def fetch() -> list[dict[str, Any]]:
            r = httpx.get(URL, timeout=90, headers={"User-Agent": "Mozilla/5.0 (compatible)"})
            r.raise_for_status()
            return r.json()
    data = compact(fetch())
    if not data["rates"]:
        raise RuntimeError("the CBN feed had no rates")
    path = path or _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)
    return {"currencies": len(data["rates"]), "updated": data["updated"]}


def load(path: Path | None = None) -> dict[str, Any] | None:
    try:
        return json.loads((path or _path()).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def rate_on(currency: str, day: date, kind: str = "central",
            data: dict[str, Any] | None = None) -> tuple[float, str] | None:
    """(rate, rate date) on the day, or the last published day before it."""
    data = data if data is not None else load()
    if not data:
        return None
    cur = (currency or "USD").strip().upper()
    series = data["rates"].get(CODES.get(cur, cur))
    if not series:
        return None
    i = {"buying": 0, "central": 1, "selling": 2}.get(kind, 1)
    best = max((d for d, v in series.items() if d <= day.isoformat() and v[i]), default=None)
    return (series[best][i], best) if best else None


def fx_rates_tool(ctx: Any, *, currency: str = "USD", on: str | None = None,
                  kind: str = "central") -> Any:
    from litchai.workbench.context import ToolError, ToolOutput

    data = load()
    if not data:
        raise ToolError("the CBN rates are not available yet on this server")
    try:
        day = date.fromisoformat(on) if on else date.today()
    except ValueError as exc:
        raise ToolError(f"{on!r} is not a date (use YYYY-MM-DD)") from exc
    hit = rate_on(currency, day, kind, data)
    if hit is None:
        raise ToolError(f"no CBN {kind} rate for {currency} on or before {day}")
    rate, when = hit
    note = "" if when == day.isoformat() else f" (the last rate published before {day})"
    return ToolOutput(
        data={"currency": currency.upper(), "rate": rate, "kind": kind, "rate_date": when,
              "source": SOURCE, "updated": data.get("updated")},
        summary=(f"CBN {kind} rate for {currency.upper()} on {when}: ₦{rate:,.4f}{note}. "
                 f"Source: {SOURCE}."))


if __name__ == "__main__":  # pragma: no cover - the VM timer
    if sys.argv[1:] == ["refresh"]:
        print(json.dumps(refresh()))
    else:
        print("usage: python -m litchai.fx_rates refresh")

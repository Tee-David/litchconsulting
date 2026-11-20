"""The edge-case scorecard: the latest live run per case and model (Admin -> Sage -> Quality).

``run_cases`` saves a short summary of each run under the engine's storage folder;
``load`` returns the latest per (case, chain) with a short history for the trend.
No client data: the cases are fictional.
"""
from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

HISTORY = 20


def _dir() -> Path:
    from litchai.storage import DEFAULT_ROOT

    return Path(os.environ.get("LITCHAI_STORAGE_DIR", DEFAULT_ROOT)) / "evals"


def summary(res: dict[str, Any]) -> dict[str, Any]:
    turns = res.get("turns") or []
    return {"case": res["case"], "client": res.get("client"), "chain": res.get("chain"),
            "found": res["found"], "of": res["of"], "found_pct": res["found_pct"],
            "tokens": res.get("tokens", 0), "unusable": res.get("unusable_replies", 0),
            "seconds": round(sum(t.get("seconds", 0) for t in turns)),
            "turns": len(turns), "model_turns": sum(1 for t in turns if not t.get("degraded")),
            "missed": [p["title"] for p in res.get("problems", []) if not p["found"]],
            "at": datetime.now(UTC).isoformat(timespec="seconds")}


def save(res: dict[str, Any], folder: Path | None = None) -> Path:
    folder = folder or _dir()
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{res['case']}-{res.get('chain', 'x')}.json"
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"history": []}
    row = summary(res)
    data = {"latest": row, "history": [*old.get("history", []), row][-HISTORY:]}
    path.write_text(json.dumps(data, indent=1), encoding="utf-8")
    return path


def load(folder: Path | None = None) -> list[dict[str, Any]]:
    folder = folder or _dir()
    if not folder.exists():
        return []
    out = []
    for p in sorted(folder.glob("*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        out.append({**d["latest"], "trend": [h["found_pct"] for h in d.get("history", [])]})
    return out

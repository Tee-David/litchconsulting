"""The edge-case scorecard keeps the latest run per case and model, with a trend."""
from __future__ import annotations

from litchai.evals.scorecard import load, save


def _res(found: int, chain: str = "groq") -> dict:
    return {"case": "importer", "client": "Harbour Traders Ltd", "chain": chain, "found": found,
            "of": 4, "found_pct": found * 25, "tokens": 1000, "unusable_replies": 1,
            "turns": [{"seconds": 3, "degraded": False}, {"seconds": 2, "degraded": True}],
            "problems": [{"title": "P1", "found": True}, {"title": "Goods in transit", "found": False}]}


def test_latest_run_and_trend_per_case_and_chain(tmp_path):
    save(_res(3), tmp_path)
    save(_res(4), tmp_path)
    save(_res(2, "deepseek"), tmp_path)
    rows = {r["chain"]: r for r in load(tmp_path)}
    assert rows["groq"]["found"] == 4 and rows["groq"]["trend"] == [75, 100]
    assert rows["groq"]["model_turns"] == 1 and rows["groq"]["turns"] == 2
    assert rows["groq"]["missed"] == ["Goods in transit"]
    assert rows["deepseek"]["found"] == 2
    assert load(tmp_path / "none") == []

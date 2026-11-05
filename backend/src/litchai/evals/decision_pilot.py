"""Decision-layer pilot (Phase 3.3): tool routing on the eval set's labelled tasks.

Each eval task names the tool(s) a correct answer uses (``expect_tools``), so the
49 tasks are 49 labelled routing decisions. For each one this measures:

* **offered** — is a correct tool among the ≤8 tools offered to the agent
  (``select_tools``)? If not, the model cannot call it at all.
* **heuristic top-1** — does the keyword layer's ``tool_route`` pick a correct tool?
* **model top-1** — same with :class:`ModelDecisionLayer` on a router/local call.
* **needs human** — share of decisions under the confidence floor.

    python -m litchai.evals.decision_pilot                 # heuristic only (offline)
    python -m litchai.evals.decision_pilot --model local   # + local model (VM)

Client data never leaves the VM for the model run: ``--model local`` routes with
``local_only``.
"""
from __future__ import annotations

import argparse
import json
import time
from typing import Any

from litchai.ai.decision import HeuristicDecisionLayer, ModelDecisionLayer
from litchai.evals.workbench import load_tasks
from litchai.workbench.tools import TOOLS


def _complete_with(router: Any, local_only: bool):
    def complete(messages: list[dict[str, str]], schema: dict[str, Any]) -> str:
        return router.complete(messages, schema=schema, local_only=local_only,
                               task="decision", params={"temperature": 0.0,
                                                        "max_tokens": 120}).text
    return complete


def run(model: str | None = None) -> dict[str, Any]:
    tasks = load_tasks()["tasks"]
    names = [t.name for t in TOOLS]
    heur = HeuristicDecisionLayer()
    mdl = None
    if model:
        from litchai.ai.router import ProviderRouter, default_specs

        specs = [s for s in default_specs() if s.name == model]
        if not specs or not specs[0].configured:
            raise SystemExit(f"provider {model!r} is not configured")
        mdl = ModelDecisionLayer(_complete_with(ProviderRouter(specs), model == "local"))

    rows, t0 = [], time.monotonic()
    for t in tasks:
        want = set(t.get("expect_tools") or [])
        if not want:
            continue
        offered = heur.select_tools(t["prompt"], list(TOOLS))
        h = heur.decide("tool_route", t["prompt"], names)
        row = {"id": t["id"], "want": sorted(want), "offered_ok": bool(want & set(offered)),
               "heuristic": h.choice, "heuristic_ok": h.choice in want,
               "heuristic_conf": h.confidence, "heuristic_human": h.needs_human}
        if mdl is not None:
            m = mdl.decide("tool_route", t["prompt"], names)
            row.update({"model": m.choice, "model_ok": m.choice in want, "model_conf": m.confidence,
                        "model_source": m.source, "model_human": m.needs_human})
        rows.append(row)

    n = len(rows)

    def rate(key: str) -> float:
        return round(sum(1 for r in rows if r.get(key)) / n, 3) if n else 0.0

    summary = {"decisions": n, "offered_recall": rate("offered_ok"),
               "heuristic_top1": rate("heuristic_ok"), "heuristic_needs_human": rate("heuristic_human"),
               "seconds": round(time.monotonic() - t0, 1)}
    if mdl is not None:
        summary.update({"model": model, "model_top1": rate("model_ok"),
                        "model_needs_human": rate("model_human"),
                        "model_used": rate("model_source") and round(
                            sum(1 for r in rows if r.get("model_source") == "model") / n, 3)})
    return {"summary": summary, "rows": rows}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--model", help="router provider for the model run (e.g. local, groq)")
    ap.add_argument("--out", help="write the full report as JSON")
    a = ap.parse_args(argv)
    rep = run(a.model)
    print(json.dumps(rep["summary"], indent=2))
    misses = [r for r in rep["rows"] if not r["offered_ok"]]
    if misses:
        print("not offered:", ", ".join(f"{r['id']} (wants {'/'.join(r['want'])})" for r in misses))
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(rep, f, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

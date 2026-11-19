"""Run the real-world edge cases live and score them by program.

    python -m litchai.evals.run_cases --case supermarket            # Groq only (default)
    python -m litchai.evals.run_cases --case supermarket --chain deepseek  # a confirm run

The chain is pinned (LITCHAI_PROVIDER_CHAIN), so a Groq run never falls over to a
paid model. Proposals are accepted after each request, as a tester would. When every
model is busy, the request waits and is tried once more. The scorecard (found per
problem, tokens, time, fallbacks, unusable replies) goes to --out as JSON.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from typing import Any


def run(slug: str, chain: str = "groq", seed: int = 2025, wait: int = 75) -> dict[str, Any]:
    os.environ["LITCHAI_PROVIDER_CHAIN"] = chain
    os.environ.setdefault("LITCHAI_RATE_WAIT", "40")  # free tier: wait out the minute
    os.environ.setdefault("LITCHAI_TURN_BUDGET", "420")
    from litchai.ai.router import build_router
    from litchai.evals.cases import registry, score
    from litchai.evals.fixtures import scripted_categoriser
    from litchai.evals.workbench import _taxonomy, passing_gate
    from litchai.workbench.engine import TurnDeps, run_turn
    from litchai.workbench.formats import to_working_copy
    from litchai.workbench.session import InMemoryBlobStore, InMemoryConversationStore, Workbench

    case = registry()[slug](seed)
    router = build_router()
    wb = Workbench(InMemoryBlobStore(), InMemoryConversationStore(), gate=passing_gate)
    conv = wb.create(client_id=None, client_name=case.client, period_label=case.period)
    for i, (name, data) in enumerate(case.files.items(), start=1):
        copy = to_working_copy(data, name, wb_id=f"doc-{i}", document_id=i)
        wb.attach_bytes(conv, copy.xlsx, name=name, origin=copy.origin, document_id=i,
                        source=copy.source(name))
    deps = TurnDeps(wb, router, taxonomy=_taxonomy(), categoriser=scripted_categoriser)
    turns, answers = [], []
    for q in case.prompts:
        for attempt in (1, 2):
            t0, ev_log = time.time(), {"tools": [], "providers": [], "retries": [],
                                       "fallbacks": []}
            final: dict[str, Any] | None = None
            for ev in run_turn(deps, conv, q):
                k = ev["type"]
                if k == "tool_call":
                    ev_log["tools"].append(ev["tool"])
                elif k == "tool_result" and not ev.get("ok"):
                    ev_log["tools"].append(f"FAILED {ev['tool']}: {str(ev.get('error'))[:160]}")
                elif k == "provider":
                    ev_log["providers"].append(ev["provider"])
                elif k == "retry":
                    ev_log["retries"].append(str(ev.get("error"))[:200])
                elif k == "fallback":
                    ev_log["fallbacks"].append(f"{ev.get('from')}->{ev.get('to')}: "
                                               f"{ev.get('reason')}")
                elif k in ("final", "error"):
                    final = ev
            text = (final or {}).get("answer") or (final or {}).get("message") or ""
            busy = (final or {}).get("type") == "error" or "busy" in text.lower()[:120]
            if busy and attempt == 1:
                time.sleep(wait)  # Groq's per-minute window
                continue
            break
        accepted = []
        for b in conv.batches:
            if b.status == "pending":
                done = wb.accept(conv, b.id)
                accepted.append(f"{b.title[:80]} -> {done.status}")
        answers.append(text)
        turns.append({"prompt": q[:120], "seconds": round(time.time() - t0, 1),
                      "tokens": (final or {}).get("tokens"),
                      "degraded": bool((final or {}).get("degraded")), "busy": busy,
                      "accepted": accepted, "answer": text[:4000], **ev_log})
        time.sleep(20)  # spread the requests over Groq's per-minute window
    result = score(case, answers)
    result.update({"chain": chain, "client": case.client, "turns": turns,
                   "tokens": sum(((t["tokens"] or {}).get("input_tokens", 0)
                                  + (t["tokens"] or {}).get("output_tokens", 0)) for t in turns),
                   "unusable_replies": sum(len(t["retries"]) for t in turns),
                   "figures": case.figures})
    return result


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - VM CLI
    p = argparse.ArgumentParser()
    p.add_argument("--case", required=True)
    p.add_argument("--chain", default="groq")
    p.add_argument("--seed", type=int, default=2025)
    p.add_argument("--out", default=None)
    a = p.parse_args(argv)
    res = run(a.case, a.chain, a.seed)
    text = json.dumps(res, indent=1, default=str)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text)
    print(json.dumps({k: res[k] for k in ("case", "chain", "found", "of", "found_pct", "tokens",
                                           "unusable_replies")}))
    for pr in res["problems"]:
        print(("FOUND  " if pr["found"] else "MISSED ") + pr["id"] + " " + pr["title"])
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

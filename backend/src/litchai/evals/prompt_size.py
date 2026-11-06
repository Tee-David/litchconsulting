"""Prompt size per workbench turn (no network): the first model call's messages for
a set of questions, in characters and estimated tokens (chars / 4).

    python -m litchai.evals.prompt_size
"""
from __future__ import annotations

import json
import sys
from typing import Any

from litchai.ai.provider import ProviderResponse
from litchai.ai.router import ProviderRouter, ProviderSpec
from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy, _workbench

CASES = [
    ("ledger_bank", "Reconcile the bank statement to the ledger and explain the difference."),
    ("ledger_bank", "Which expense category grew the most, and chart it by month?"),
    ("qa_tb", "Make a chart of the expense accounts"),
    ("qa_bankrec", "Reconcile the bank statement to the cash book for October."),
    ("qa_fuel", "Which truck cost the most in fuel in March?"),
]


def first_call(fixture: str, question: str) -> list[dict[str, Any]]:
    from litchai.workbench.engine import TurnDeps, run_turn

    seen: list[list[dict[str, Any]]] = []

    def capture(spec, messages, schema, params):
        seen.append(messages)
        return ProviderResponse(text=json.dumps({"action": "final", "answer": "ok"}),
                                input_tokens=1, output_tokens=1)

    wb, conv = _workbench({"fixture": fixture})
    router = ProviderRouter([ProviderSpec("groq", "cloud", "m", "https://g", api_key="k")],
                            transport=capture)
    list(run_turn(TurnDeps(wb, router, taxonomy=_taxonomy(),
                           categoriser=scripted_categoriser), conv, question))
    return seen[0] if seen else []


def measure() -> list[dict[str, Any]]:
    rows = []
    for fixture, q in CASES:
        msgs = first_call(fixture, q)
        chars = sum(len(m["content"]) for m in msgs)
        rows.append({"fixture": fixture, "question": q, "chars": chars,
                     "tokens_est": round(chars / 4),
                     "system_chars": len(msgs[0]["content"]) if msgs else 0})
    return rows


def main() -> int:
    rows = measure()
    for r in rows:
        print(f"{r['tokens_est']:>6} tok  ({r['chars']} chars, system {r['system_chars']})  "
              f"{r['fixture']}: {r['question'][:60]}")
    print(f"mean {round(sum(r['tokens_est'] for r in rows) / len(rows))} tokens per first call")
    return 0


if __name__ == "__main__":
    sys.exit(main())

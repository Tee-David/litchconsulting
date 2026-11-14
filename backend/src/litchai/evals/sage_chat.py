"""H5: run the Sage chat routing eval with the real embedder (on the VM).

    python -m litchai.evals.sage_chat            # semantic router only
    python -m litchai.evals.sage_chat --llm      # plus the model router for low-confidence

Prints the score and every miss. CI runs the same set with the fake embedder
(tests/test_sage_chat_evals.py) as a floor.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

TASKS = json.loads((Path(__file__).with_name("sage_chat_tasks.json")).read_text(encoding="utf-8"))["tasks"]


def main(argv: list[str] | None = None) -> int:
    from litchai.ai import assistant as A
    from litchai.ai.provider import FakeProvider
    from litchai.embeddings import OllamaEmbedder

    argv = argv or sys.argv[1:]
    router = A.SemanticRouter(OllamaEmbedder())
    if "--llm" in argv:
        from litchai.ai.router import BoundRouter, build_router

        provider = BoundRouter(build_router(), task="eval_route")
    else:
        provider = FakeProvider(responder=lambda p: json.dumps({"tool": "none"}))
    hits = 0
    for t in TASKS:
        try:
            d = A.route_message(t["q"], router, provider=provider)
            got = d.tool.name if d.tool else None
            how = f"{d.method} {getattr(d, 'score', None) or ''}".strip()
        except Exception as exc:  # noqa: BLE001
            got, how = f"error: {type(exc).__name__}", ""
        ok = got == t["tool"]
        hits += ok
        if not ok:
            print(f"miss: {t['q']!r}: want {t['tool']}, got {got} ({how})")
    print(f"Sage chat routing: {hits}/{len(TASKS)} = {hits / len(TASKS):.0%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

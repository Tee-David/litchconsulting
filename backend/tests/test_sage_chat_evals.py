"""H5: the Sage chat routing eval set. Every question must reach the right tool.

CI runs it without a model: the semantic router with the fake embedder, and a
model router that never helps (it names no tool). The score must not drop below
the floor; raise the floor when routing improves. Run the same set with the real
embedder on the VM: ``python -m litchai.evals.sage_chat``.
"""
from __future__ import annotations

import json
from pathlib import Path

from litchai import knowledge as K
from litchai.ai import assistant as A
from litchai.ai.provider import FakeProvider
from litchai.db import InMemoryRepository
from litchai.embeddings import FakeEmbedder

TASKS = json.loads((Path(A.__file__).resolve().parents[1] / "evals" / "sage_chat_tasks.json")
                   .read_text(encoding="utf-8"))["tasks"]
FLOOR = 0.70  # measured 2026-11-14: 23/32 with the fake embedder (32/32 with the real one)


def _route_all():
    repo, emb = InMemoryRepository(), FakeEmbedder()
    K.reindex(repo, emb)
    router = A.SemanticRouter(emb)
    no_help = FakeProvider(responder=lambda p: json.dumps({"tool": "none"}))
    out = []
    for t in TASKS:
        try:
            d = A.route_message(t["q"], router, provider=no_help)
            got = d.tool.name if d.tool else None
        except Exception as exc:  # noqa: BLE001 - a crash is a miss
            got = f"error: {type(exc).__name__}"
        out.append((t["q"], t["tool"], got))
    return out


def test_eval_set_shape():
    assert len(TASKS) >= 30
    assert {t["tool"] for t in TASKS} <= {t.name for t in A.TOOLS}


def test_routing_score_does_not_drop():
    results = _route_all()
    hits = sum(1 for _, want, got in results if want == got)
    misses = [f"{q!r}: want {want}, got {got}" for q, want, got in results if want != got]
    score = hits / len(results)
    print(f"Sage chat routing: {hits}/{len(results)} = {score:.0%}")
    for m in misses:
        print("  miss:", m)
    assert score >= FLOOR, "\n".join(misses)

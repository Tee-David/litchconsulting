"""Review-pack cache for ``/engagements/{id}/ask`` (Phase 3.8).

Asking a question used to recompile the whole engagement (minutes of
LibreOffice) every time. The pack is now cached per *engagement version*: a
fingerprint over the engagement's template/aux inputs/materiality and every
attached line item's id, category, direction and amount. Any recategorisation,
new document or input change produces a new fingerprint and a fresh compile;
an unchanged engagement answers from the cache.
"""
from __future__ import annotations

import hashlib
import json
import threading
from collections import OrderedDict
from typing import Any


def engagement_fingerprint(repo: Any, engagement_id: int) -> str | None:
    eng = repo.get_engagement(engagement_id)
    if eng is None:
        return None
    lines = []
    docs = []
    for doc in repo.list_documents(eng.client_id, limit=5000):
        if doc.engagement_id != engagement_id:
            continue
        docs.append(doc.id)
        for li in repo.get_line_items(doc.id):
            lines.append((li.id, li.category_code, li.direction, round(float(li.amount or 0), 2)))
    payload = {
        "template": eng.template, "aux": eng.aux_inputs, "materiality": eng.materiality,
        "docs": sorted(docs), "lines": sorted(lines, key=lambda x: x[0]),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


class ReviewPackCache:
    def __init__(self, max_items: int = 64) -> None:
        self.max_items = max_items
        self._d: OrderedDict[tuple[int, str], Any] = OrderedDict()
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, engagement_id: int, fingerprint: str) -> Any | None:
        with self._lock:
            pack = self._d.get((engagement_id, fingerprint))
            if pack is None:
                self.misses += 1
                return None
            self._d.move_to_end((engagement_id, fingerprint))
            self.hits += 1
            return pack

    def put(self, engagement_id: int, fingerprint: str, pack: Any) -> None:
        with self._lock:
            # one live version per engagement
            for key in [k for k in self._d if k[0] == engagement_id]:
                self._d.pop(key, None)
            self._d[(engagement_id, fingerprint)] = pack
            while len(self._d) > self.max_items:
                self._d.popitem(last=False)

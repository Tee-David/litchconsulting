"""Frozen eval benchmark + verify (Phase 3).

A labeled narration→category set replayed through the ladder: overall + per-rung
accuracy, the fallback rate (how often the LLM/suspense is reached), and the top
confusions. Every threshold/prompt/model/taxonomy change re-runs this — it's the
regression gate for the AI side, and `seed verify`'s "are we warm?" check.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from litchai.categorize.ladder import DEFAULT_CONFIG, LadderConfig, LlmClassify, classify
from litchai.categorize.memory_store import MemoryStore
from litchai.embeddings import Embedder
from litchai.taxonomy import Taxonomy


@dataclass(frozen=True)
class LabeledItem:
    normalized_text: str
    expected_code: str
    client_id: str | None = None


@dataclass(frozen=True)
class RungStat:
    resolved: int = 0
    correct: int = 0

    @property
    def accuracy(self) -> float:
        return self.correct / self.resolved if self.resolved else 0.0


@dataclass(frozen=True)
class EvalReport:
    total: int
    correct: int
    per_rung: dict[int, RungStat]
    confusions: list[tuple[str, str, int]] = field(default_factory=list)

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0

    @property
    def fallback_rate(self) -> float:
        """Fraction reaching rung 4 (LLM) or unresolved (rung 0) — the expensive
        tail the deterministic rungs should keep small (< 10% gate)."""
        if not self.total:
            return 0.0
        tail = sum(s.resolved for r, s in self.per_rung.items() if r in (0, 4))
        return tail / self.total


def evaluate(
    items: list[LabeledItem],
    *,
    store: MemoryStore,
    taxonomy: Taxonomy,
    embedder: Embedder | None = None,
    llm_classify: LlmClassify | None = None,
    config: LadderConfig = DEFAULT_CONFIG,
) -> EvalReport:
    resolved: Counter[int] = Counter()
    correct_by_rung: Counter[int] = Counter()
    confusions: Counter[tuple[str, str]] = Counter()
    correct = 0

    for item in items:
        decision = classify(
            item.normalized_text, client_id=item.client_id, store=store, taxonomy=taxonomy,
            embedder=embedder, llm_classify=llm_classify, config=config,
        )
        resolved[decision.rung] += 1
        if decision.category_code == item.expected_code:
            correct += 1
            correct_by_rung[decision.rung] += 1
        else:
            confusions[(item.expected_code, decision.category_code)] += 1

    per_rung = {
        rung: RungStat(resolved=resolved[rung], correct=correct_by_rung[rung])
        for rung in sorted(resolved)
    }
    top_confusions = [(exp, got, n) for (exp, got), n in confusions.most_common(10)]
    return EvalReport(total=len(items), correct=correct, per_rung=per_rung, confusions=top_confusions)

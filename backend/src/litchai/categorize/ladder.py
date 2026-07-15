"""The categorization ladder (Phase 3, PRD §7 step 4).

Cheapest deterministic rung first; the LLM is the rare last resort:

    1. normalized-exact match      (weighted vote ≥ exact_vote)
    2. pg_trgm trigram similarity  (sim ≥ trigram_sim, vote ≥ trigram_vote)
    3. pgvector nearest-neighbor   (cos ≥ vector_cos,  vote ≥ vector_vote)
    4. enum-constrained LLM        (shortlist ≤ 10; LLM proposes, code decides;
                                    always needs_review in v1)

**LLM proposes, code decides**: rung 4 only accepts a code that is on the
shortlist the code built. Every rung's candidates + threshold + outcome are
captured in :attr:`LadderDecision.events` (one ``categorization_events`` row
each — replayable, and the raw material for empirical threshold tuning).

The store and (optional) embedder/LLM are injected, so the whole ladder runs in
tests with an in-memory store + fake embedder + a scripted classifier — no
Postgres, no Ollama.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from litchai.categorize.memory_store import MemoryRecord, MemoryStore
from litchai.categorize.retrieval import hybrid
from litchai.embeddings import Embedder
from litchai.taxonomy import SUSPENSE_CODE, Taxonomy

# (normalized_text, shortlist_codes, examples[(narration, code)]) -> chosen code | None
LlmClassify = Callable[[str, list[str], list[tuple[str, str]]], str | None]


@dataclass(frozen=True)
class LadderConfig:
    exact_vote: float = 0.9
    trigram_sim: float = 0.55
    trigram_vote: float = 0.6
    vector_cos: float = 0.82
    vector_vote: float = 0.6
    shortlist_limit: int = 10
    examples_limit: int = 5


DEFAULT_CONFIG = LadderConfig()


@dataclass(frozen=True)
class RungCandidate:
    category_code: str
    support: float      # Σ weight·similarity for this category
    max_similarity: float


@dataclass(frozen=True)
class RungEvent:
    rung: int
    threshold: float | None
    candidates: list[RungCandidate]
    accepted: bool
    chosen_code: str | None


@dataclass(frozen=True)
class LadderDecision:
    normalized_text: str
    category_code: str
    source: str | None       # exact | trigram | vector | llm | None (unresolved → suspense)
    confidence: float
    rung: int                # 1..4; 0 = unresolved
    needs_review: bool
    candidates: list[RungCandidate] = field(default_factory=list)
    events: list[RungEvent] = field(default_factory=list)


def _vote(pairs: list[tuple[MemoryRecord, float]]) -> tuple[list[RungCandidate], str, float, float]:
    """Aggregate (record, similarity) pairs into per-category candidates and a
    vote share for the winner (winner support / total support)."""
    support: dict[str, float] = {}
    max_sim: dict[str, float] = {}
    for rec, sim in pairs:
        support[rec.category_code] = support.get(rec.category_code, 0.0) + rec.weight * sim
        max_sim[rec.category_code] = max(max_sim.get(rec.category_code, 0.0), sim)
    candidates = sorted(
        (RungCandidate(code, support[code], max_sim[code]) for code in support),
        key=lambda c: c.support,
        reverse=True,
    )
    total = sum(support.values())
    winner = candidates[0]
    vote = winner.support / total if total else 0.0
    return candidates, winner.category_code, vote, winner.max_similarity


def classify(
    normalized_text: str,
    *,
    client_id: str | None,
    store: MemoryStore,
    taxonomy: Taxonomy,
    embedder: Embedder | None = None,
    llm_classify: LlmClassify | None = None,
    config: LadderConfig = DEFAULT_CONFIG,
) -> LadderDecision:
    events: list[RungEvent] = []
    neighbor_codes: list[str] = []

    # Rung 1 — normalized exact.
    exact = store.exact(normalized_text, client_id)
    if exact:
        cands, code, vote, _ = _vote([(r, 1.0) for r in exact])
        accepted = vote >= config.exact_vote
        events.append(RungEvent(1, config.exact_vote, cands, accepted, code))
        if accepted:
            return _resolved(normalized_text, code, "exact", vote, 1, False, cands, events)

    # Rung 2 — trigram.
    tri = store.trigram(normalized_text, client_id, config.trigram_sim)
    if tri:
        cands, code, vote, _ = _vote(tri)
        accepted = vote >= config.trigram_vote
        events.append(RungEvent(2, config.trigram_vote, cands, accepted, code))
        neighbor_codes = [c.category_code for c in cands]
        if accepted:
            return _resolved(normalized_text, code, "trigram", vote, 2, False, cands, events)

    # Rung 3 — vector.
    if embedder is not None:
        vec = store.vector(embedder.embed_query(normalized_text), client_id, config.vector_cos)
        if vec:
            cands, code, vote, _ = _vote(vec)
            accepted = vote >= config.vector_vote
            events.append(RungEvent(3, config.vector_vote, cands, accepted, code))
            neighbor_codes = neighbor_codes + [c.category_code for c in cands]
            if accepted:
                return _resolved(normalized_text, code, "vector", vote, 3, False, cands, events)

    # Rung 4 — enum-constrained LLM (proposes; code decides).
    if llm_classify is not None:
        shortlist = build_shortlist(normalized_text, neighbor_codes, taxonomy, config.shortlist_limit)
        examples = [
            (r.normalized_text, r.category_code)
            for r in hybrid(normalized_text, client_id, store, embedder, limit=config.examples_limit)
        ]
        chosen = llm_classify(normalized_text, shortlist, examples)
        accepted = bool(chosen) and chosen in shortlist
        events.append(
            RungEvent(4, None, [RungCandidate(c, 0.0, 0.0) for c in shortlist], accepted, chosen)
        )
        if accepted:
            # v1: an LLM decision always goes to review.
            return _resolved(normalized_text, chosen, "llm", 0.5, 4, True, [], events)

    # Unresolved → suspense, always reviewed.
    return LadderDecision(
        normalized_text=normalized_text,
        category_code=SUSPENSE_CODE,
        source=None,
        confidence=0.0,
        rung=0,
        needs_review=True,
        candidates=[],
        events=events,
    )


def _resolved(text, code, source, confidence, rung, needs_review, candidates, events) -> LadderDecision:
    return LadderDecision(
        normalized_text=text,
        category_code=code,
        source=source,
        confidence=round(confidence, 4),
        rung=rung,
        needs_review=needs_review,
        candidates=candidates,
        events=events,
    )


def build_shortlist(
    normalized_text: str, neighbor_codes: list[str], taxonomy: Taxonomy, limit: int
) -> list[str]:
    """≤ ``limit`` postable codes for rung 4: rung-2/3 neighbors + their siblings
    + keyword-matched leaves + suspense (always). Preserves neighbor order."""
    by_code = taxonomy.by_code()
    postable = {c.code for c in taxonomy.postable_leaves()}
    ordered: list[str] = []

    def _add(code: str) -> None:
        if code in postable and code not in ordered:
            ordered.append(code)

    for code in neighbor_codes:
        _add(code)
        parent = by_code[code].parent if code in by_code else None
        if parent is not None:
            for sib in taxonomy.categories:
                if sib.parent == parent:
                    _add(sib.code)

    tokens = set(normalized_text.split())
    for leaf in taxonomy.postable_leaves():
        if tokens & {kw.lower() for kw in leaf.keywords}:
            _add(leaf.code)

    if SUSPENSE_CODE not in ordered:
        ordered.append(SUSPENSE_CODE)
    # Keep suspense even when truncating.
    if len(ordered) > limit:
        head = [c for c in ordered if c != SUSPENSE_CODE][: limit - 1]
        ordered = [*head, SUSPENSE_CODE]
    return ordered

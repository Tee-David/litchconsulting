"""Categorization ladder + retrieval + transfers (Phase 3)."""
import json
from datetime import date
from decimal import Decimal

from litchai.ai import FakeProvider, InMemoryCache, InMemoryTelemetry
from litchai.categorize.ladder import LadderConfig, build_shortlist, classify
from litchai.categorize.llm import build_llm_classifier
from litchai.categorize.memory_store import InMemoryStore, MemoryRecord, trigram_similarity
from litchai.categorize.retrieval import hybrid
from litchai.categorize.transfers import TransferLeg, pair_internal_transfers
from litchai.embeddings import FakeEmbedder
from litchai.taxonomy import SUSPENSE_CODE, load_taxonomy

TAXO = load_taxonomy()
CLIENT = "c-1"


def _seed(store, text, code, *, embedder=None, source="seed_history", client_id=None, weight=1.0):
    embedding = embedder.embed_documents([text])[0] if embedder else None
    return store.add(
        MemoryRecord(
            id=0, normalized_text=text, category_code=code, source=source,
            client_id=client_id, weight=weight, embedding=embedding,
            taxonomy_version=TAXO.version,
        )
    )


# --- rung routing ----------------------------------------------------------


def test_rung1_exact_match():
    store = InMemoryStore()
    _seed(store, "paystack settlement", "revenue.services")
    decision = classify("paystack settlement", client_id=CLIENT, store=store, taxonomy=TAXO)
    assert decision.rung == 1
    assert decision.source == "exact"
    assert decision.category_code == "revenue.services"
    assert decision.needs_review is False
    assert decision.confidence == 1.0


def test_rung2_trigram_match():
    store = InMemoryStore()
    _seed(store, "gtbank pos purchase", "revenue.goods")
    # near-miss text: no exact, high trigram overlap
    decision = classify("gtbank pos purchases", client_id=CLIENT, store=store, taxonomy=TAXO)
    assert decision.rung == 2
    assert decision.source == "trigram"
    assert decision.category_code == "revenue.goods"


def test_rung3_vector_match():
    embedder = FakeEmbedder()
    store = InMemoryStore()
    _seed(store, "shoprite groceries", "cos.purchases", embedder=embedder)
    # config forces exact + trigram to abstain so a vector hit resolves it
    cfg = LadderConfig(exact_vote=1.1, trigram_vote=1.1, vector_cos=0.5, vector_vote=0.6)
    decision = classify(
        "shoprite groceries", client_id=CLIENT, store=store, taxonomy=TAXO,
        embedder=embedder, config=cfg,
    )
    assert decision.rung == 3
    assert decision.source == "vector"
    assert decision.category_code == "cos.purchases"


def test_rung4_llm_when_no_memory_hit():
    store = InMemoryStore()  # empty → nothing for rungs 1-3

    def fake_llm(text, shortlist, examples):
        assert "admin.it_comm" in shortlist  # keyword-built shortlist
        return "admin.it_comm"

    decision = classify(
        "airtime data mtn", client_id=CLIENT, store=store, taxonomy=TAXO, llm_classify=fake_llm
    )
    assert decision.rung == 4
    assert decision.source == "llm"
    assert decision.category_code == "admin.it_comm"
    assert decision.needs_review is True  # v1: LLM decisions always reviewed


def test_unresolved_falls_to_suspense():
    store = InMemoryStore()
    decision = classify("zzz qqq wxy", client_id=CLIENT, store=store, taxonomy=TAXO)
    assert decision.rung == 0
    assert decision.category_code == SUSPENSE_CODE
    assert decision.source is None
    assert decision.needs_review is True


def test_events_logged_per_rung():
    store = InMemoryStore()
    _seed(store, "gtbank pos purchase", "revenue.goods")
    decision = classify("gtbank pos purchases", client_id=CLIENT, store=store, taxonomy=TAXO)
    rungs = [e.rung for e in decision.events]
    assert rungs == [2]  # exact had no hit (not logged), trigram resolved
    assert decision.events[0].accepted is True


def test_client_scoping_excludes_other_clients():
    store = InMemoryStore()
    _seed(store, "acme retainer", "revenue.services", client_id="other-client")
    decision = classify("acme retainer", client_id=CLIENT, store=store, taxonomy=TAXO)
    assert decision.category_code == SUSPENSE_CODE  # other client's memory not visible


# --- shortlist -------------------------------------------------------------


def test_build_shortlist_includes_suspense_and_caps():
    shortlist = build_shortlist("airtime mtn data", [], TAXO, limit=5)
    assert SUSPENSE_CODE in shortlist
    assert "admin.it_comm" in shortlist  # keyword match
    assert len(shortlist) <= 5


def test_build_shortlist_keeps_suspense_when_truncated():
    neighbors = [c.code for c in TAXO.postable_leaves()[:20]]
    shortlist = build_shortlist("x", neighbors, TAXO, limit=3)
    assert len(shortlist) == 3
    assert SUSPENSE_CODE in shortlist


# --- ladder + real harness end-to-end (rung 4 through the AI harness) -------


def test_rung4_through_ai_harness():
    store = InMemoryStore()
    provider = FakeProvider(responder=lambda p: json.dumps({"category": "admin.it_comm"}))
    cache, telemetry = InMemoryCache(), InMemoryTelemetry()
    llm = build_llm_classifier(provider, TAXO, cache=cache, telemetry=telemetry)

    decision = classify(
        "airtime data mtn", client_id=CLIENT, store=store, taxonomy=TAXO, llm_classify=llm
    )
    assert decision.rung == 4
    assert decision.category_code == "admin.it_comm"
    assert telemetry.events[-1].status == "ok"
    # the prompt the model saw contained the shortlist and the narration
    assert "airtime data mtn" in provider.calls[0]


def test_rung4_off_shortlist_llm_answer_rejected_to_suspense():
    store = InMemoryStore()
    provider = FakeProvider(responder=lambda p: json.dumps({"category": "revenue.rental"}))
    llm = build_llm_classifier(provider, TAXO)
    # 'revenue.rental' won't be on an airtime shortlist → rule reject → unresolved
    decision = classify(
        "airtime data mtn", client_id=CLIENT, store=store, taxonomy=TAXO, llm_classify=llm
    )
    assert decision.category_code == SUSPENSE_CODE
    assert decision.needs_review is True


# --- retrieval + transfers -------------------------------------------------


def test_hybrid_retrieval_ranks_shared_tokens_first():
    embedder = FakeEmbedder()
    store = InMemoryStore()
    _seed(store, "mtn airtime purchase", "admin.it_comm", embedder=embedder)
    _seed(store, "glo data bundle", "admin.it_comm", embedder=embedder)
    _seed(store, "shoprite groceries", "cos.purchases", embedder=embedder)
    top = hybrid("mtn airtime", CLIENT, store, embedder, limit=2)
    assert top
    assert top[0].normalized_text == "mtn airtime purchase"


def test_trigram_similarity_monotonic():
    assert trigram_similarity("paystack", "paystack") == 1.0
    assert trigram_similarity("paystack settlement", "paystack settlment") > 0.55
    assert trigram_similarity("paystack", "shoprite") < 0.3


def test_internal_transfer_pairing():
    legs = [
        TransferLeg(0, "ACC-A", "out", Decimal("100000.00"), date(2026, 1, 10), is_candidate=True),
        TransferLeg(1, "ACC-B", "in", Decimal("100000.00"), date(2026, 1, 11)),
        TransferLeg(2, "ACC-A", "out", Decimal("5000.00"), date(2026, 1, 15), is_candidate=True),
    ]
    pairs, unmatched = pair_internal_transfers(legs)
    assert len(pairs) == 1
    assert (pairs[0].out_index, pairs[0].in_index) == (0, 1)
    assert pairs[0].day_gap == 1
    assert unmatched == [2]  # candidate out-leg with no partner


def test_transfer_not_paired_across_same_account():
    legs = [
        TransferLeg(0, "ACC-A", "out", Decimal("100.00"), date(2026, 1, 1)),
        TransferLeg(1, "ACC-A", "in", Decimal("100.00"), date(2026, 1, 1)),
    ]
    pairs, _ = pair_internal_transfers(legs)
    assert pairs == []  # same account isn't an internal transfer

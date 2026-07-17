"""Admin Copilot chat tests (Milestone 8).

FakeProvider + FakeEmbedder + InMemoryRepository. Covers the two-stage router
(semantic-confident with no LLM, then LLM fallback), READ tools returning grounded
data, WRITE tools returning a proposal only (never executed), the citation +
"I don't know" behaviour of grounded generation, and the /assistant/chat route.
"""
import json
from contextlib import contextmanager

from fastapi.testclient import TestClient
from procrastinate import testing

from litchai import knowledge as K
from litchai.ai import assistant as A
from litchai.ai.cache import InMemoryTelemetry
from litchai.ai.provider import FakeProvider
from litchai.api import create_app
from litchai.categorize.memory_store import InMemoryStore
from litchai.db import InMemoryRepository
from litchai.embeddings import FakeEmbedder
from litchai.queue import queue
from litchai.storage import Storage

CLIENT = "11111111-1111-1111-1111-111111111111"


def _seeded():
    repo, emb = InMemoryRepository(), FakeEmbedder()
    K.reindex(repo, emb)
    return repo, emb, A.SemanticRouter(emb)


def _answer(text="answer", can=True):
    return FakeProvider(responder=lambda p: json.dumps({"answer": text, "can_answer": can}))


# --- routing ---------------------------------------------------------------
def test_semantic_route_is_confident_without_llm():
    _, emb, router = _seeded()
    decision = A.route_message(
        "what is the vat rate in nigeria", router, provider=FakeProvider()
    )
    assert decision.method == "semantic"
    assert decision.tool.name == "search_knowledge"


def test_low_confidence_falls_back_to_llm_route():
    _, emb, router = _seeded()
    provider = FakeProvider(responder=lambda p: json.dumps({"tool": "pipeline_health"}))
    decision = A.route_message("zxqw fghj plooop", router, provider=provider)
    assert decision.method == "llm"
    assert decision.tool.name == "pipeline_health"
    assert len(provider.calls) == 1


def test_slot_extraction_from_message():
    _, _, router = _seeded()
    decision = A.route_message(
        "reclassify line 5 in document 3 to bank.charges", router, provider=FakeProvider()
    )
    assert decision.tool.name == "recategorize_line"
    assert decision.slots == {"document_id": 3, "line_item_id": 5, "category_code": "bank.charges"}


# --- READ tools ------------------------------------------------------------
def test_knowledge_answer_is_grounded_with_citations():
    repo, emb, router = _seeded()
    provider = _answer("The standard VAT rate in Nigeria is 7.5%.")
    result = A.answer_chat(
        "what is the vat rate in nigeria", repo=repo, embedder=emb, provider=provider, router=router
    )
    assert result.tool == "search_knowledge"
    assert result.can_answer is True
    assert result.citations                       # deterministic, from retrieval
    assert len(provider.calls) == 1               # answer only — routing used no LLM


def test_list_analyses_returns_tool_card():
    repo, emb, router = _seeded()
    repo.create_document(
        client_id=CLIENT, filename="gtbank.pdf", mime="application/pdf", source_hash="h1"
    )
    result = A.answer_chat(
        "list the documents we have analysed", repo=repo, embedder=emb, provider=_answer("one doc"),
        router=router,
    )
    assert result.tool == "list_analyses"
    assert result.tool_result["count"] == 1
    assert result.tool_result["documents"][0]["filename"] == "gtbank.pdf"


def test_idk_when_no_context_and_no_data(monkeypatch):
    repo, emb, router = _seeded()
    # A knowledge question routes semantically (no LLM), but force retrieval to
    # return nothing so there's genuinely nothing to ground on.
    monkeypatch.setattr(A, "hybrid_knowledge", lambda *a, **k: [])
    provider = _answer("should not be used", can=False)
    result = A.answer_chat(
        "what is the vat rate in nigeria", repo=repo, embedder=emb, provider=provider, router=router
    )
    assert result.can_answer is False
    assert result.citations == []
    assert len(provider.calls) == 0               # semantic route + short-circuit = no model spend


# --- WRITE tools (proposal only) -------------------------------------------
def test_write_tool_returns_proposal_and_never_executes():
    repo, emb, router = _seeded()
    provider = _answer("nope")
    result = A.answer_chat(
        "approve engagement 4", repo=repo, embedder=emb, provider=provider, router=router
    )
    assert result.tool == "transition_engagement"
    assert result.proposal is not None
    assert result.proposal["action"] == "engagement_transition"
    assert result.proposal["params"] == {"engagement_id": 4, "action": "approve"}
    assert result.proposal["ready"] is True
    assert len(provider.calls) == 0               # a proposal never runs generation


def test_telemetry_records_generation_call():
    repo, emb, router = _seeded()
    telemetry = InMemoryTelemetry()
    A.answer_chat(
        "what is the vat rate in nigeria", repo=repo, embedder=emb, provider=_answer("7.5%"),
        router=router, telemetry=telemetry,
    )
    assert any(e.task == "assistant_answer" for e in telemetry.events)


# --- API route -------------------------------------------------------------
def _app():
    repo, emb = InMemoryRepository(), FakeEmbedder()
    K.reindex(repo, emb)

    @contextmanager
    def repo_provider():
        yield repo

    @contextmanager
    def store_provider():
        yield InMemoryStore()

    app = create_app(
        repo_provider=repo_provider,
        store_provider=store_provider,
        storage=Storage(root="/tmp/litchai-test-assistant"),
        provider_factory=lambda: _answer("The standard VAT rate is 7.5%."),
        embedder_factory=lambda: emb,
    )
    return repo, app


def test_assistant_chat_endpoint():
    repo, app = _app()
    with queue.replace_connector(testing.InMemoryConnector()), TestClient(app) as client:
        resp = client.post("/assistant/chat", json={"message": "what is the vat rate in nigeria"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["tool"] == "search_knowledge"
        assert body["can_answer"] is True
        assert isinstance(body["citations"], list)


def test_assistant_chat_requires_client_id_for_client_scope():
    repo, app = _app()
    with queue.replace_connector(testing.InMemoryConnector()), TestClient(app) as client:
        resp = client.post("/assistant/chat", json={"message": "hi", "scope": "client"})
        assert resp.status_code == 400


def test_knowledge_reindex_endpoint():
    repo, app = _app()
    with queue.replace_connector(testing.InMemoryConnector()), TestClient(app) as client:
        resp = client.post("/knowledge/reindex")
        assert resp.status_code == 200
        assert resp.json()["upserted"] > 0

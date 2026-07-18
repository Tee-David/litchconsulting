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


# --- general chat (external provider, off-corpus) --------------------------
def _chat(text="Hi there! How can I help?"):
    """A FakeProvider standing in for the external OpenAI-compatible chat model.
    Returns plain text (the general path uses no JSON schema)."""
    return FakeProvider(responder=lambda p: text)


def test_general_chat_routes_to_chat_provider_with_no_citations():
    repo, emb, router = _seeded()
    local = _answer("SHOULD NOT BE USED", can=False)  # local model + RAG must stay untouched
    chat = _chat("Doing well, thanks for asking!")
    result = A.answer_chat(
        "hello, how are you", repo=repo, embedder=emb, provider=local, router=router,
        chat_provider=chat,
    )
    assert result.tool == "general_chat"
    assert result.routed_by == "semantic"
    assert result.can_answer is True
    assert result.citations == []
    assert result.answer == "Doing well, thanks for asking!"
    assert len(chat.calls) == 1                        # answered by the external provider
    assert len(local.calls) == 0                       # never spent the local model on this


def test_general_chat_without_provider_degrades_to_grounded_refusal():
    repo, emb, router = _seeded()
    local = _answer("nope")
    result = A.answer_chat(
        "thanks for your help", repo=repo, embedder=emb, provider=local, router=router,
        chat_provider=None,
    )
    assert result.tool == "general_chat"
    assert result.answer == A.GENERAL_CHAT_UNAVAILABLE
    assert result.citations == []
    assert result.can_answer is True
    assert len(local.calls) == 0                       # no model call, no hallucination


def test_tax_question_stays_on_search_knowledge_not_general_chat():
    # Safety (D4): a tax/finance question must never fall into ungrounded chat,
    # even with a chat provider available.
    repo, emb, router = _seeded()
    chat = _chat("SHOULD NOT BE USED")
    result = A.answer_chat(
        "what is the vat rate", repo=repo, embedder=emb, provider=_answer("7.5%"),
        router=router, chat_provider=chat,
    )
    assert result.tool == "search_knowledge"
    assert len(chat.calls) == 0


def test_search_knowledge_wins_near_tie_over_general_chat():
    gc, sk = A.TOOLS_BY_NAME["general_chat"], A.TOOLS_BY_NAME["search_knowledge"]
    # Within epsilon → grounded tool is promoted.
    near = A._prefer_knowledge_on_tie([(gc, 0.80), (sk, 0.78)], A.KNOWLEDGE_TIE_EPSILON)
    assert near[0][0].name == "search_knowledge"
    # Comfortably ahead → general_chat is left alone.
    clear = A._prefer_knowledge_on_tie([(gc, 0.90), (sk, 0.50)], A.KNOWLEDGE_TIE_EPSILON)
    assert clear[0][0].name == "general_chat"


def test_build_chat_provider_is_gated_on_env(monkeypatch):
    from litchai.ai.provider import OpenAICompatProvider, build_chat_provider

    for k in ("LITCHAI_CHAT_BASE_URL", "LITCHAI_CHAT_API_KEY", "LITCHAI_CHAT_MODEL"):
        monkeypatch.delenv(k, raising=False)
    assert build_chat_provider() is None               # unset env → no general chat
    monkeypatch.setenv("LITCHAI_CHAT_BASE_URL", "https://api.groq.com/openai/v1")
    monkeypatch.setenv("LITCHAI_CHAT_API_KEY", "sk-test")
    monkeypatch.setenv("LITCHAI_CHAT_MODEL", "llama-3.3-70b")
    provider = build_chat_provider()
    assert isinstance(provider, OpenAICompatProvider)
    assert provider.request_model == "llama-3.3-70b"
    assert provider.name == "openai_compat"


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

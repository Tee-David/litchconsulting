"""Sage knows the workbench and the new admin features (3.10): knowledge chunks,
router utterances, VM read tools and the two-pass app-read contract."""
from __future__ import annotations

import json
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from procrastinate import testing

from litchai import knowledge as K
from litchai.ai import assistant as A
from litchai.ai.provider import FakeProvider
from litchai.api import create_app
from litchai.categorize.memory_store import InMemoryStore
from litchai.db import InMemoryRepository
from litchai.embeddings import FakeEmbedder
from litchai.queue import queue
from litchai.storage import Storage


def _seeded():
    repo, emb = InMemoryRepository(), FakeEmbedder()
    K.reindex(repo, emb)
    return repo, emb, A.SemanticRouter(emb)


def _answer(text="answer"):
    return FakeProvider(responder=lambda p: json.dumps({"answer": text, "can_answer": True}))


def test_corpus_has_workbench_and_platform_guidance():
    chunks = [c for c in K.build_firm_chunks() if c.source_id in ("workbench", "platform")]
    text = " ".join(c.text for c in chunks)
    assert {c.source_id for c in chunks} == {"workbench", "platform"}
    assert all(c.source_type == "sop" for c in chunks)
    for phrase in ("30-day hold", "To confirm", "Run restore test", "review round",
                   "Only admins and staff can be assigned", "Nothing Sage does changes the file",
                   "local only"):
        assert phrase.lower() in text.lower(), phrase
    assert "copilot" not in text.lower()


@pytest.mark.parametrize(("message", "tool"), [
    ("which bank transfers are waiting for confirmation", "billing_status"),
    ("which clients have erasure pending", "client_privacy"),
    ("who is assigned to REQ-2026-010", "request_work"),
    ("did the last restore test pass", "backup_status"),
    ("what is pending in the workbench", "workbench_status"),
    ("which ai model is sage using", "ai_engine_status"),
    ("how do i confirm a bank transfer payment", "search_knowledge"),
    ("what is the vat rate in nigeria", "search_knowledge"),
])
def test_new_utterances_route_without_an_llm(message, tool):
    _, _, router = _seeded()
    decision = A.route_message(message, router, provider=FakeProvider())
    assert decision.method == "semantic" and decision.tool.name == tool


def test_request_number_slot():
    tool = A.TOOLS_BY_NAME["request_work"]
    assert A.extract_slots("open asks on req-2026-014 please", tool) == {
        "request_number": "REQ-2026-014"}


def test_app_read_is_two_pass():
    repo, emb, router = _seeded()
    provider = _answer("Two transfers are waiting: ₦250,000 and ₦1,000,000.")
    msg = "which bank transfers are waiting for confirmation"
    first = A.answer_chat(msg, repo=repo, embedder=emb, provider=provider, router=router,
                          app_tools=True)
    assert first.needs_app_data == {"tool": "billing_status", "slots": {}, "client_id": None}
    assert first.answer == "" and provider.calls == []          # no model call spent
    data = {"pending_transfers": [{"invoice": "INV-2026-004", "amount": 250000}]}
    second = A.answer_chat(msg, repo=repo, embedder=emb, provider=provider, router=router,
                           app_tools=True, app_data={"tool": "billing_status", "data": data})
    assert second.needs_app_data is None and second.tool_result == data
    assert "INV-2026-004" in provider.calls[-1]                  # grounded on the app data
    # an older relay (no app_tools) still gets a knowledge answer
    old = A.answer_chat(msg, repo=repo, embedder=emb, provider=_answer("See Billing."),
                        router=router)
    assert old.needs_app_data is None and old.answer == "See Billing."


def test_app_data_for_another_tool_is_ignored():
    repo, emb, router = _seeded()
    out = A.answer_chat("which clients have erasure pending", repo=repo, embedder=emb,
                        provider=_answer(), router=router, app_tools=True,
                        app_data={"tool": "billing_status", "data": {"x": 1}})
    assert out.needs_app_data["tool"] == "client_privacy"


def test_vm_read_tools():
    repo, emb, router = _seeded()
    status = [{"name": "groq", "kind": "cloud", "model": "m", "configured": True, "ok": True,
               "detail": "", "used_requests": 3, "used_tokens": 900, "daily_requests": 1000,
               "daily_tokens": 200000, "exhausted_until": None, "api_key": "never"}]
    out = A.answer_chat("which ai model is sage using", repo=repo, embedder=emb,
                        provider=_answer("Groq."), router=router, engine_status=lambda: status)
    assert out.tool_result["providers"][0]["used_tokens"] == 900
    assert "api_key" not in out.tool_result["providers"][0]
    wb = A.answer_chat("what is pending in the workbench", repo=repo, embedder=emb,
                       provider=_answer(), router=router)
    assert wb.tool == "workbench_status"


def test_chat_endpoint_carries_the_contract(tmp_path):
    repo, emb = InMemoryRepository(), FakeEmbedder()
    K.reindex(repo, emb)

    @contextmanager
    def repo_provider():
        yield repo

    @contextmanager
    def store_provider():
        yield InMemoryStore()

    app = create_app(repo_provider=repo_provider, store_provider=store_provider,
                     storage=Storage(root=tmp_path), provider_factory=lambda: _answer("ok"),
                     embedder_factory=lambda: emb)
    with queue.replace_connector(testing.InMemoryConnector()), TestClient(app) as c:
        body = c.post("/assistant/chat", json={
            "message": "did the last restore test pass", "app_tools": True}).json()
        assert body["needs_app_data"]["tool"] == "backup_status"
        body = c.post("/assistant/chat", json={
            "message": "did the last restore test pass", "app_tools": True,
            "app_data": {"tool": "backup_status", "data": {"last_restore_test": "passed"}}}).json()
        assert body["needs_app_data"] is None and body["answer"] == "ok"

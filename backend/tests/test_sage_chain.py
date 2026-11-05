"""Sage through the provider chain (report 5.2 / R1): masked cloud answers,
local-only, plain-word failures (never a 500), and quote/invoice proposals."""
from __future__ import annotations

import json
from contextlib import contextmanager

import httpx
import pytest
from fastapi.testclient import TestClient
from procrastinate import testing

from litchai import knowledge as K
from litchai.ai import assistant as A
from litchai.ai.provider import FakeProvider, ProviderResponse
from litchai.ai.router import ProviderError, ProviderRouter, ProviderSpec
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


class Transport:
    """Scripted chain: per provider, a reply (str) or an exception."""

    def __init__(self, replies: dict[str, object]) -> None:
        self.replies = replies
        self.seen: list[tuple[str, str]] = []

    def __call__(self, spec, messages, schema, params):
        self.seen.append((spec.name, messages[-1]["content"]))
        r = self.replies.get(spec.name, ProviderError("error", "no script"))
        if isinstance(r, Exception):
            raise r
        return ProviderResponse(text=str(r), input_tokens=10, output_tokens=5)


def _chain(replies):
    t = Transport(replies)
    specs = [ProviderSpec("groq", "cloud", "gpt-oss-120b", "https://g", api_key="k"),
             ProviderSpec("local", "local", "gemma3:4b", "http://l", api="ollama")]
    return ProviderRouter(specs, transport=t), t


ANSWER = json.dumps({"answer": "Clients pay from the invoice link [1].", "can_answer": True})


def test_answer_goes_through_the_chain_and_reports_the_engine():
    repo, emb, router = _seeded()
    chain, t = _chain({"groq": ANSWER})
    local = FakeProvider(responder=lambda p: pytest.fail("local provider must not be used"))
    out = A.answer_chat("how does a client pay an invoice", repo=repo, embedder=emb,
                        provider=local, router=router, model_router=chain)
    assert out.answer.startswith("Clients pay") and out.error is None
    assert out.engine == {"provider": "groq", "model": "gpt-oss-120b", "kind": "cloud",
                          "masked": True}
    assert [n for n, _ in t.seen] == ["groq"]


def test_app_data_names_are_masked_before_the_cloud():
    repo, emb, router = _seeded()
    chain, t = _chain({"groq": json.dumps({"answer": "[NAME_1] owes ₦250,000.",
                                           "can_answer": True})})
    data = {"overdue_invoices": [{"client": "Okonkwo Agro-Allied Ltd", "balance": 250000}]}
    out = A.answer_chat("which invoices are overdue", repo=repo, embedder=emb,
                        provider=FakeProvider(), router=router, model_router=chain,
                        app_tools=True, app_data={"tool": "billing_status", "data": data})
    sent = t.seen[-1][1]
    assert "Okonkwo Agro-Allied" not in sent and "250000" in sent
    assert out.answer == "Okonkwo Agro-Allied Ltd owes ₦250,000."


def test_local_only_never_reaches_the_cloud():
    repo, emb, router = _seeded()
    chain, t = _chain({"local": ANSWER, "groq": AssertionError("cloud used")})
    out = A.answer_chat("how does a client pay an invoice", repo=repo, embedder=emb,
                        provider=FakeProvider(), router=router, model_router=chain,
                        local_only=True)
    assert out.error is None and {n for n, _ in t.seen} == {"local"}


@pytest.mark.parametrize(("exc", "reason"), [
    (ProviderError("timeout", "ReadTimeout"), "timeout"),
    (ProviderError("quota", "tokens per day"), "quota"),
    (ProviderError("http_5xx", "502"), "unavailable"),
])
def test_model_failures_become_plain_words(exc, reason):
    repo, emb, router = _seeded()
    chain, _ = _chain({"groq": exc, "local": exc})
    out = A.answer_chat("how does a client pay an invoice", repo=repo, embedder=emb,
                        provider=FakeProvider(), router=router, model_router=chain)
    assert out.error == reason and out.can_answer is False
    assert out.answer == A.BUSY_MESSAGES[reason]


def test_an_old_style_provider_timeout_is_also_caught():
    repo, emb, router = _seeded()

    def boom(prompt):
        raise httpx.ReadTimeout("ollama")

    out = A.answer_chat("how does a client pay an invoice", repo=repo, embedder=emb,
                        provider=FakeProvider(responder=boom), router=router)
    assert out.error == "timeout" and "took too long" in out.answer


@pytest.mark.parametrize(("message", "tool", "client", "amount"), [
    ("Create a quote for Acme Ltd for 500,000 naira.", "create_quote", "Acme Ltd", 500_000),
    ("create an invoice for Okonkwo Farms for ₦1.2m for the audit", "create_invoice",
     "Okonkwo Farms", 1_200_000),
    ("bill Kanem Logistics 300k for the payroll work", "create_invoice", "Kanem Logistics",
     300_000),
])
def test_quote_and_invoice_requests_become_proposals(message, tool, client, amount):
    repo, emb, router = _seeded()
    out = A.answer_chat(message, repo=repo, embedder=emb, provider=FakeProvider(), router=router)
    assert out.tool == tool and out.proposal is not None
    p = out.proposal
    assert p["action"] == "create_billing_draft" and p["ready"] is True
    assert p["params"]["client_name"] == client and p["params"]["amount"] == amount
    assert "review it in Billing" in out.answer


def test_a_quote_without_details_asks_for_them():
    repo, emb, router = _seeded()
    out = A.answer_chat("prepare a quotation for this client", repo=repo, embedder=emb,
                        provider=FakeProvider(), router=router)
    assert out.proposal["ready"] is False and "tell me" in out.answer


def _app(tmp_path, *, embedder_factory=None, router=None):
    repo, emb = InMemoryRepository(), FakeEmbedder()
    K.reindex(repo, emb)

    @contextmanager
    def repo_provider():
        yield repo

    @contextmanager
    def store_provider():
        yield InMemoryStore()

    return create_app(repo_provider=repo_provider, store_provider=store_provider,
                      storage=Storage(root=tmp_path), embedder_factory=embedder_factory or (lambda: emb),
                      provider_factory=lambda: FakeProvider(),
                      router_factory=(lambda: router) if router else None)


def test_endpoint_answers_in_words_when_everything_is_down(tmp_path):
    def broken():
        raise httpx.ConnectError("ollama down")

    app = _app(tmp_path, embedder_factory=broken)
    with queue.replace_connector(testing.InMemoryConnector()), TestClient(app) as c:
        r = c.post("/assistant/chat", json={"message": "how do I pay"})
    assert r.status_code == 200
    assert r.json()["error"] == "unavailable" and "Try again" in r.json()["answer"]


def test_endpoint_uses_the_cloud_chain_and_local_only_flag(tmp_path):
    chain, _ = _chain({"groq": ANSWER, "local": ANSWER})
    app = _app(tmp_path, router=chain)
    with queue.replace_connector(testing.InMemoryConnector()), TestClient(app) as c:
        body = c.post("/assistant/chat", json={"message": "how does a client pay an invoice"}).json()
        assert body["engine"]["provider"] == "groq"
        body = c.post("/assistant/chat", json={"message": "how does a client pay an invoice",
                                               "local_only": True}).json()
        assert body["engine"]["provider"] == "local"

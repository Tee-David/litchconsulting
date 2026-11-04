"""Model router + privacy masking (Phase 3.1 / 3.4). No network: a scripted
transport stands in for the providers."""
from __future__ import annotations

import pytest

from litchai.ai.privacy import Masker, contains_unmasked_pii, header_kind
from litchai.ai.provider import ProviderResponse
from litchai.ai.router import (
    AllProvidersFailed,
    InMemoryCallLog,
    ProviderError,
    ProviderRouter,
    ProviderSpec,
    classify_http_error,
    default_specs,
)


def _specs() -> list[ProviderSpec]:
    return [
        ProviderSpec("groq", "cloud", "gpt-oss-120b", "https://g", api_key="k1"),
        ProviderSpec("cerebras", "cloud", "gpt-oss-120b", "https://c", api_key="k2"),
        ProviderSpec("sambanova", "cloud", "llama", "https://s", api_key=None),  # no key
        ProviderSpec("local", "local", "gemma3:4b", "http://127.0.0.1:11434", api="ollama"),
    ]


class Script:
    """Transport that fails the named providers with the given reason."""

    def __init__(self, fail: dict[str, str] | None = None, reply: str = "hello") -> None:
        self.fail = fail or {}
        self.reply = reply
        self.seen: list[tuple[str, list[dict]]] = []

    def __call__(self, spec, messages, schema, params):
        self.seen.append((spec.name, messages))
        if spec.name in self.fail:
            raise ProviderError(self.fail[spec.name], "scripted")
        return ProviderResponse(text=self.reply, input_tokens=10, output_tokens=5, latency_ms=3)


def test_picks_first_configured_and_pins_per_conversation():
    t = Script()
    r = ProviderRouter(_specs(), transport=t)
    out = r.complete([{"role": "user", "content": "hi"}], conversation_id="c1")
    assert out.provider == "groq" and out.fallbacks == []
    assert r.pinned("c1") == "groq"
    # Unconfigured SambaNova never appears in the chain.
    assert [s.name for s in r.chain()] == ["groq", "cerebras", "local"]


def test_falls_back_with_reason_and_repins():
    t = Script(fail={"groq": "quota"})
    log = InMemoryCallLog()
    r = ProviderRouter(_specs(), transport=t, call_log=log)
    out = r.complete([{"role": "user", "content": "hi"}], conversation_id="c2")
    assert out.provider == "cerebras"
    assert out.fallbacks[0].provider == "groq" and out.fallbacks[0].reason == "quota"
    assert out.fallbacks[0].next_provider == "cerebras"
    assert r.pinned("c2") == "cerebras"
    # Daily exhaustion is remembered: a new conversation skips Groq without calling it.
    t.seen.clear()
    out2 = r.complete([{"role": "user", "content": "hi"}], conversation_id="c3")
    assert out2.provider == "cerebras"
    assert "groq" not in [name for name, _ in t.seen]
    statuses = [rec.status for rec in log.records]
    assert statuses[:2] == ["quota", "ok"]
    assert log.records[1].fallback_from == "groq"


def test_local_only_never_touches_cloud():
    t = Script()
    r = ProviderRouter(_specs(), transport=t)
    out = r.complete([{"role": "user", "content": "Pay Ada Nwosu"}], local_only=True)
    assert out.provider == "local" and out.masked is False
    assert [name for name, _ in t.seen] == ["local"]


def test_cloud_payload_is_masked_and_answer_unmasked():
    t = Script(reply="Paid [EMAIL_1] and [NAME_1].")
    r = ProviderRouter(_specs(), transport=t)
    m = Masker()
    m.register_names(["Okonkwo Agro-Allied Ltd"])
    out = r.complete(
        [{"role": "user", "content": "Email ada@okonkwo.ng about Okonkwo Agro-Allied Ltd"}],
        masker=m,
    )
    sent = t.seen[0][1][0]["content"]
    assert "ada@okonkwo.ng" not in sent and "Okonkwo" not in sent
    assert "Paid ada@okonkwo.ng and Okonkwo Agro-Allied Ltd." == out.text


def test_invalid_output_falls_through():
    t = Script(reply="not json")
    r = ProviderRouter(_specs(), transport=t)
    with pytest.raises(AllProvidersFailed) as ei:
        r.complete([{"role": "user", "content": "x"}], validate=lambda s: "bad json")
    assert {a.reason for a in ei.value.attempts} == {"invalid_output"}


def test_quota_counters_block_when_daily_limit_reached():
    specs = [ProviderSpec("groq", "cloud", "m", "https://g", api_key="k", daily_requests=1),
             ProviderSpec("local", "local", "m", "http://l", api="ollama")]
    r = ProviderRouter(specs, transport=Script())
    assert r.complete([{"role": "user", "content": "a"}]).provider == "groq"
    assert r.complete([{"role": "user", "content": "b"}]).provider == "local"


def test_probe_is_a_real_completion_and_cached():
    t = Script(fail={"cerebras": "auth"})
    r = ProviderRouter(_specs(), transport=t)
    status = {s["name"]: s for s in r.status(probe=True)}
    assert status["groq"]["ok"] is True
    assert status["cerebras"]["ok"] is False and status["cerebras"]["detail"] == "auth"
    assert status["sambanova"]["ok"] is False and status["sambanova"]["detail"] == "no key"
    assert "api_key" not in status["groq"]
    n = len(t.seen)
    r.status()  # cached — no new calls
    assert len(t.seen) == n


def test_classify_http_error():
    assert classify_http_error(429, "Rate limit reached for tokens per day (TPD)").reason == "quota"
    assert classify_http_error(429, "Rate limit reached, try again in 1m2.5s").reason == "rate_limit"
    assert classify_http_error(429, "try again in 1m2.5s").retry_after == pytest.approx(62.5)
    assert classify_http_error(402, "Payment required").reason == "quota"
    assert classify_http_error(503, "").reason == "http_5xx"
    assert classify_http_error(401, "").reason == "auth"


def test_default_specs_from_env_and_legacy_chat():
    specs = default_specs({
        "GROQ_API_KEY": "g",
        "LITCHAI_CHAT_BASE_URL": "https://api.cerebras.ai/v1",
        "LITCHAI_CHAT_API_KEY": "c",
        "LITCHAI_CHAT_MODEL": "gpt-oss-120b",
    })
    by = {s.name: s for s in specs}
    assert [s.name for s in specs] == ["groq", "cerebras", "sambanova", "local"]
    assert by["groq"].params["reasoning_effort"] == "low"
    assert by["cerebras"].api_key == "c"
    assert by["sambanova"].configured is False
    assert by["local"].api == "ollama" and by["local"].model == "gemma3:4b"
    llama = default_specs({"LITCHAI_LLAMA_SERVER_URL": "http://127.0.0.1:8080"})
    assert next(s for s in llama if s.name == "local").base_url == "http://127.0.0.1:8080/v1"
    custom = default_specs({"LITCHAI_PROVIDER_CHAIN": "local,groq", "GROQ_API_KEY": "g"})
    assert [s.name for s in custom] == ["local", "groq"]


# --- masking ------------------------------------------------------------------
def test_masker_tokens_are_stable_and_reversible():
    m = Masker()
    text = (
        "TRF FROM JOHN ADEBAYO OKAFOR acct no 0123456789, TIN 12345678-0001, "
        "call 08031234567 or mail john@x.com. Amount 1500000000."
    )
    masked = m.mask(text)
    for leak in ("JOHN ADEBAYO OKAFOR", "0123456789", "12345678-0001", "08031234567", "john@x.com"):
        assert leak not in masked
    assert "1500000000" in masked  # bare amounts survive
    assert not contains_unmasked_pii(masked)
    assert m.unmask(masked) == text
    assert m.mask("john@x.com") == m.mask("john@x.com")  # stable


def test_masker_columns_and_state_roundtrip():
    m = Masker()
    rows = m.mask_rows(["Date", "Payee", "Account No", "Amount"],
                       [["2025-01-02", "Ada Nwosu", "0011223344", 5000]])
    assert rows[0][0] == "2025-01-02" and rows[0][3] == 5000
    assert rows[0][1].startswith("[NAME_") and rows[0][2].startswith("[ACCT_")
    m2 = Masker.from_state(m.to_state())
    assert m2.unmask(rows[0][1]) == "Ada Nwosu"
    assert m2.token_for("NAME", "Someone Else") == "[NAME_2]"
    assert header_kind("Account Name") == "NAME"
    assert header_kind("Customer TIN") == "TIN"
    assert header_kind("Amount") is None

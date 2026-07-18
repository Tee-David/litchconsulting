"""LLM provider seam (Phase 3 AI harness).

One ``generate`` method. Ollama is a single httpx POST with JSON-Schema-
constrained ``format`` (enum-constrained structured output — the whole point of
rung 4); a paid adapter later is ~40 lines behind the same Protocol. A
:class:`FakeProvider` returns scripted responses so the harness, validate chain
and ladder are testable with no model running.
"""
from __future__ import annotations

import os
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass(frozen=True)
class ProviderResponse:
    text: str
    finish_reason: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: int | None = None
    model_digest: str | None = None


@runtime_checkable
class Provider(Protocol):
    name: str
    request_model: str
    model_digest: str | None

    def generate(
        self, prompt: str, *, schema: dict[str, Any] | None = None, params: dict[str, Any] | None = None
    ) -> ProviderResponse: ...


class OllamaProvider:
    name = "ollama"

    def __init__(
        self,
        model: str = "gemma3:4b",
        host: str | None = None,
        model_digest: str | None = None,
    ) -> None:
        self.request_model = model
        self._host = host or os.environ.get("LITCHAI_OLLAMA_HOST", "http://127.0.0.1:11434")
        # Pin by manifest digest (temperature 0 alone isn't deterministic — the
        # exact-match cache is the real reproducibility mechanism, decision 14).
        self.model_digest = model_digest or os.environ.get("LITCHAI_GEMMA_DIGEST")

    def generate(
        self, prompt: str, *, schema: dict[str, Any] | None = None, params: dict[str, Any] | None = None
    ) -> ProviderResponse:
        import httpx  # noqa: PLC0415

        options = {"temperature": 0.0, "seed": 7, "num_ctx": 2048}
        options.update(params or {})
        body: dict[str, Any] = {"model": self.request_model, "prompt": prompt, "stream": False, "options": options}
        if schema is not None:
            body["format"] = schema  # Ollama JSON-Schema structured output
        started = time.monotonic()
        resp = httpx.post(f"{self._host}/api/generate", json=body, timeout=120.0)
        resp.raise_for_status()
        data = resp.json()
        return ProviderResponse(
            text=data.get("response", ""),
            finish_reason=data.get("done_reason"),
            input_tokens=data.get("prompt_eval_count"),
            output_tokens=data.get("eval_count"),
            latency_ms=int((time.monotonic() - started) * 1000),
            model_digest=self.model_digest,
        )


class OpenAICompatProvider:
    """OpenAI-compatible chat provider for the **general-chat** path only.

    Cerebras / Groq / SambaNova all expose the same ``/chat/completions`` shape,
    so one adapter fronts whichever is chosen by env (``LITCHAI_CHAT_BASE_URL``).
    Firm-knowledge and client-data questions never touch this — they stay on the
    local :class:`OllamaProvider` + RAG. There is no model digest to pin (the
    remote model isn't reproducible), so the exact-match cache doesn't apply and
    this is only ever called on the direct general-chat path, not via the harness.
    """

    name = "openai_compat"

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 60.0,
    ) -> None:
        self.request_model = model
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self.model_digest = None  # remote model — not digest-pinned

    def generate(
        self, prompt: str, *, schema: dict[str, Any] | None = None, params: dict[str, Any] | None = None
    ) -> ProviderResponse:
        import httpx  # noqa: PLC0415

        p = params or {}
        body: dict[str, Any] = {
            "model": self.request_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": p.get("temperature", 0.7),
        }
        if p.get("max_tokens") is not None:
            body["max_tokens"] = p["max_tokens"]
        if p.get("top_p") is not None:
            body["top_p"] = p["top_p"]
        if schema is not None:  # general path passes no schema; honour one if given
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "response", "schema": schema},
            }
        started = time.monotonic()
        resp = httpx.post(
            f"{self._base_url}/chat/completions",
            json=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            timeout=self._timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        text = ((choice.get("message") or {}).get("content") or "")
        usage = data.get("usage") or {}
        return ProviderResponse(
            text=text,
            finish_reason=choice.get("finish_reason"),
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
            latency_ms=int((time.monotonic() - started) * 1000),
            model_digest=self.model_digest,
        )


def build_chat_provider() -> Provider | None:
    """Return the general-chat provider when all three envs are set, else ``None``.

    Gated so an unset config just means "no general chat" (a graceful grounded
    refusal upstream) — never a crash. Reads are cheap; callers cache the result.
    """
    base_url = os.environ.get("LITCHAI_CHAT_BASE_URL")
    api_key = os.environ.get("LITCHAI_CHAT_API_KEY")
    model = os.environ.get("LITCHAI_CHAT_MODEL")
    if not (base_url and api_key and model):
        return None
    return OpenAICompatProvider(base_url=base_url, api_key=api_key, model=model)


@dataclass
class FakeProvider:
    """Scripted provider for tests. ``responder`` maps a prompt to the raw text
    the model would return; default echoes a fixed string."""

    responder: Callable[[str], str] = field(default=lambda prompt: "{}")
    request_model: str = "fake-model"
    name: str = "fake"
    model_digest: str | None = "fake-digest"
    calls: list[str] = field(default_factory=list)

    def generate(
        self, prompt: str, *, schema: dict[str, Any] | None = None, params: dict[str, Any] | None = None
    ) -> ProviderResponse:
        self.calls.append(prompt)
        return ProviderResponse(
            text=self.responder(prompt), finish_reason="stop", model_digest=self.model_digest
        )

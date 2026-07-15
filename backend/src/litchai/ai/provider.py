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

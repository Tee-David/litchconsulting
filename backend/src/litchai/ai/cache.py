"""Exact-match AI cache + append-only telemetry (Phase 3 AI harness).

The cache key folds in every version component (task, model digest, prompt/
taxonomy/schema versions, params, normalized input hash), so a bump to any of
them auto-invalidates — the cache is the reproducibility mechanism (decision 14).
Telemetry is one append-only row per attempt (OTel GenAI vocabulary), cache hits
included. In-memory impls here; pg impls in :mod:`litchai.ai.pg` (VM).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class TelemetryEvent:
    task: str
    provider: str
    request_model: str
    model_digest: str | None
    prompt_version: str | None
    prompt_hash: str | None
    taxonomy_version: str | None
    schema_hash: str | None
    input_hash: str
    params: dict[str, Any]
    output: dict[str, Any] | None
    raw_output: str | None
    finish_reason: str | None
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: int | None
    attempt: int
    cache_hit: bool
    status: str            # 'ok' | 'invalid_schema' | 'rule_rejected' | 'error'
    error: str | None = None


class AiCache(Protocol):
    def get(self, cache_key: str) -> dict[str, Any] | None: ...

    def set(self, cache_key: str, output: dict[str, Any], meta: dict[str, Any]) -> None: ...


class AiTelemetry(Protocol):
    def record(self, event: TelemetryEvent) -> None: ...


class InMemoryCache:
    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}
        self.hits = 0

    def get(self, cache_key: str) -> dict[str, Any] | None:
        out = self._store.get(cache_key)
        if out is not None:
            self.hits += 1
        return out

    def set(self, cache_key: str, output: dict[str, Any], meta: dict[str, Any]) -> None:
        self._store[cache_key] = output


class InMemoryTelemetry:
    def __init__(self) -> None:
        self.events: list[TelemetryEvent] = []

    def record(self, event: TelemetryEvent) -> None:
        self.events.append(event)


@dataclass
class NullTelemetry:
    """No-op telemetry for call sites that don't care (e.g. unit tests)."""

    events: list = field(default_factory=list)

    def record(self, event: TelemetryEvent) -> None:  # noqa: D401
        pass

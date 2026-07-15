"""``run_task`` — the single AI entry point (Phase 3 AI harness).

Renders the versioned prompt, hashes it and the input, checks the exact-match
cache, calls the provider, runs the validate chain, records telemetry, and
retries once on malformed output (never on a rule reject). No gateway, no
framework — an in-process function (decision 14).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from litchai.ai.cache import AiCache, AiTelemetry, NullTelemetry, TelemetryEvent
from litchai.ai.provider import Provider
from litchai.ai.tasks import TaskSpec
from pydantic import BaseModel


@dataclass(frozen=True)
class TaskResult:
    ok: bool
    output: dict[str, Any] | None
    model: BaseModel | None
    cache_hit: bool
    attempts: int
    needs_review: bool
    error: str | None = None


def _canonical(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _cache_key(parts: dict[str, Any]) -> str:
    return _sha256(_canonical(parts))


def run_task(
    spec: TaskSpec,
    inputs: dict[str, Any],
    *,
    provider: Provider,
    cache: AiCache | None = None,
    telemetry: AiTelemetry | None = None,
    taxonomy_version: str | None = None,
) -> TaskResult:
    telemetry = telemetry or NullTelemetry()
    prompt = spec.render(inputs)
    prompt_hash = _sha256(prompt)
    schema_hash = _sha256(_canonical(spec.output_schema))
    input_hash = _sha256(_canonical(inputs))
    params = spec.policy.params()

    key = _cache_key(
        {
            "task": spec.name,
            "model": provider.request_model,
            "digest": provider.model_digest,
            "prompt_version": spec.prompt_version,
            "taxonomy_version": taxonomy_version,
            "schema_hash": schema_hash,
            "input_hash": input_hash,
            "params": params,
        }
    )

    def _event(**kw: Any) -> TelemetryEvent:
        base: dict[str, Any] = {
            "task": spec.name, "provider": provider.name, "request_model": provider.request_model,
            "model_digest": provider.model_digest, "prompt_version": spec.prompt_version,
            "prompt_hash": prompt_hash, "taxonomy_version": taxonomy_version, "schema_hash": schema_hash,
            "input_hash": input_hash, "params": params, "output": None, "raw_output": None,
            "finish_reason": None, "input_tokens": None, "output_tokens": None, "latency_ms": None,
            "attempt": 0, "cache_hit": False, "status": "ok", "error": None,
        }
        base.update(kw)
        return TelemetryEvent(**base)

    if cache is not None:
        cached = cache.get(key)
        if cached is not None:
            telemetry.record(_event(cache_hit=True, status="ok", output=cached))
            return TaskResult(
                ok=True, output=cached, model=spec.output_model.model_validate(cached),
                cache_hit=True, attempts=0, needs_review=False,
            )

    last_error: str | None = None
    attempt = 0
    for attempt in range(1, spec.policy.max_attempts + 1):
        resp = provider.generate(prompt, schema=spec.output_schema, params=params)
        outcome = spec.validate(resp.text, inputs)
        telemetry.record(
            _event(
                attempt=attempt,
                status="ok" if outcome.ok else (outcome.kind or "error"),
                raw_output=resp.text,
                output=outcome.model.model_dump() if outcome.ok and outcome.model else None,
                finish_reason=resp.finish_reason,
                input_tokens=resp.input_tokens,
                output_tokens=resp.output_tokens,
                latency_ms=resp.latency_ms,
                error=outcome.error,
            )
        )
        if outcome.ok and outcome.model is not None:
            output = outcome.model.model_dump()
            if cache is not None:
                cache.set(key, output, meta={
                    "task": spec.name, "request_model": provider.request_model,
                    "model_digest": provider.model_digest, "prompt_version": spec.prompt_version,
                    "taxonomy_version": taxonomy_version, "schema_hash": schema_hash,
                    "input_hash": input_hash,
                })
            return TaskResult(
                ok=True, output=output, model=outcome.model, cache_hit=False,
                attempts=attempt, needs_review=False,
            )
        last_error = outcome.error
        if outcome.kind == "rule_rejected":
            break  # a rule reject is a designed outcome, not a transient error — go to review

    return TaskResult(
        ok=False, output=None, model=None, cache_hit=False,
        attempts=attempt, needs_review=True, error=last_error,
    )

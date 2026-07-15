"""Postgres AI cache + telemetry (Phase 3) — the VM impls of the harness seams.

``ai_cache`` is exact-match keyed on the fully-versioned cache key; ``ai_calls``
is append-only (one row per attempt, cache hits included). Import-safe without a
database; runs on the VM.
"""
from __future__ import annotations

from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from litchai.ai.cache import TelemetryEvent


class PgCache:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def get(self, cache_key: str) -> dict[str, Any] | None:
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE ai_cache SET hit_count = hit_count + 1, last_hit_at = now() "
                "WHERE cache_key = %s RETURNING output",
                (cache_key,),
            )
            row = cur.fetchone()
            return row["output"] if row else None

    def set(self, cache_key: str, output: dict[str, Any], meta: dict[str, Any]) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ai_cache (cache_key, task, request_model, model_digest, prompt_version, "
                "taxonomy_version, schema_hash, input_hash, output) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (cache_key) DO NOTHING",
                (
                    cache_key, meta.get("task"), meta.get("request_model"), meta.get("model_digest"),
                    meta.get("prompt_version"), meta.get("taxonomy_version"), meta.get("schema_hash"),
                    meta.get("input_hash"), Jsonb(output),
                ),
            )


class PgTelemetry:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def record(self, event: TelemetryEvent) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ai_calls (task, provider, request_model, model_digest, prompt_version, "
                "prompt_hash, taxonomy_version, schema_hash, input_hash, params, output, raw_output, "
                "finish_reason, input_tokens, output_tokens, latency_ms, attempt, cache_hit, status, error) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    event.task, event.provider, event.request_model, event.model_digest,
                    event.prompt_version, event.prompt_hash, event.taxonomy_version, event.schema_hash,
                    event.input_hash, Jsonb(event.params), Jsonb(event.output) if event.output else None,
                    event.raw_output, event.finish_reason, event.input_tokens, event.output_tokens,
                    event.latency_ms, event.attempt, event.cache_hit, event.status, event.error,
                ),
            )

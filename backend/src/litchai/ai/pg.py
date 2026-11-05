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


class PgCallLog:
    """Router call log → ``ai_provider_calls`` (payload hash only, never content)."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def record(self, rec: Any) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ai_provider_calls (conversation_id, task, provider, model, kind, "
                "payload_hash, masked, local_only, input_tokens, output_tokens, latency_ms, "
                "status, fallback_from, fallback_reason, error) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    rec.conversation_id, rec.task, rec.provider, rec.model, rec.kind,
                    rec.payload_hash, rec.masked, rec.local_only, rec.input_tokens,
                    rec.output_tokens, rec.latency_ms, rec.status, rec.fallback_from,
                    rec.fallback_reason, rec.error,
                ),
            )


class PgQuota:
    """Daily per-provider usage in ``ai_provider_quota`` (UTC day)."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def usage(self, provider: str) -> tuple[int, int]:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT requests, tokens FROM ai_provider_quota "
                "WHERE provider = %s AND day = (now() AT TIME ZONE 'utc')::date",
                (provider,),
            )
            row = cur.fetchone()
        return (int(row["requests"]), int(row["tokens"])) if row else (0, 0)

    def record(self, provider: str, tokens: int) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ai_provider_quota (provider, day, requests, tokens) "
                "VALUES (%s, (now() AT TIME ZONE 'utc')::date, 1, %s) "
                "ON CONFLICT (provider, day) DO UPDATE SET "
                "requests = ai_provider_quota.requests + 1, "
                "tokens = ai_provider_quota.tokens + EXCLUDED.tokens",
                (provider, max(0, tokens)),
            )

    def exhausted_until(self, provider: str) -> float | None:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT max(exhausted_until) AS until FROM ai_provider_quota "
                "WHERE provider = %s AND exhausted_until > now()",
                (provider,),
            )
            row = cur.fetchone()
        until = row["until"] if row else None
        return until.timestamp() if until else None

    def mark_exhausted(self, provider: str, until: float) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ai_provider_quota (provider, day, exhausted_until) "
                "VALUES (%s, (now() AT TIME ZONE 'utc')::date, to_timestamp(%s)) "
                "ON CONFLICT (provider, day) DO UPDATE "
                "SET exhausted_until = EXCLUDED.exhausted_until",
                (provider, until),
            )


class ConnectingCallLog:
    """Long-lived router call log: one short connection per record, never raises."""

    def record(self, rec: Any) -> None:
        from litchai.db.pg import connect

        try:
            conn = connect()
        except Exception:  # noqa: BLE001 — a log write must never break a model call
            return
        try:
            PgCallLog(conn).record(rec)
        except Exception:  # noqa: BLE001, S110
            pass
        finally:
            conn.close()


class ConnectingQuota:
    """Postgres-backed daily quota with an in-memory fallback when the DB is down."""

    def __init__(self) -> None:
        from litchai.ai.router import InMemoryQuota

        self._mem = InMemoryQuota()

    def _run(self, fn_name: str, *args: Any) -> Any:
        from litchai.db.pg import connect

        try:
            conn = connect()
        except Exception:  # noqa: BLE001
            return getattr(self._mem, fn_name)(*args)
        try:
            return getattr(PgQuota(conn), fn_name)(*args)
        except Exception:  # noqa: BLE001
            return getattr(self._mem, fn_name)(*args)
        finally:
            conn.close()

    def usage(self, provider: str) -> tuple[int, int]:
        return self._run("usage", provider)

    def record(self, provider: str, tokens: int) -> None:
        self._mem.record(provider, tokens)
        self._run("record", provider, tokens)

    def exhausted_until(self, provider: str) -> float | None:
        return self._run("exhausted_until", provider)

    def mark_exhausted(self, provider: str, until: float) -> None:
        self._mem.mark_exhausted(provider, until)
        self._run("mark_exhausted", provider, until)

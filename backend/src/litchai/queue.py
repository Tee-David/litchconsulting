"""Procrastinate job queue (PRD §8) — Postgres-backed, no extra broker.

Queue state lives in the same Postgres as the pipeline data and survives
restarts. The connector string is read from LITCHAI_DATABASE_URL when the app
opens (API lifespan / worker startup), never at import; tests swap in
procrastinate's InMemoryConnector via ``queue.replace_connector``.

Worker (VM): ``procrastinate --app=litchai.queue.queue worker``
Schema:      ``procrastinate --app=litchai.queue.queue schema --apply``
"""
from __future__ import annotations

import os

from procrastinate import App, PsycopgConnector

queue = App(
    connector=PsycopgConnector(conninfo=os.environ.get("LITCHAI_DATABASE_URL", ""))
)


@queue.task(name="litchai.ping")
def ping(payload: str = "pong") -> str:
    """Smoke-test task: proves defer → store → worker → result end-to-end."""
    return payload


@queue.task(name="litchai.heartbeat")
def heartbeat() -> int:
    """Idle-reclaim heartbeat (Phase 6): a bounded CPU burst + a DB round-trip so
    OCI doesn't reclaim the VM. Deferred by a systemd timer."""
    from litchai.db.pg import connect
    from litchai.ops.heartbeat import heartbeat_burst

    iterations = heartbeat_burst()
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
    finally:
        conn.close()
    return iterations


@queue.task(name="litchai.ingest_document")
def ingest_document(document_id: int) -> str:
    """Scan → (Phase 2b) extract a received document. Constructs the production
    seams from the VM environment: psycopg repo, ClamAV scanner, blind-relay
    decryptor. Returns the resulting document status.

    Imports are local so the module stays importable without a database/VM.
    """
    from litchai.ai.pg import PgCache, PgTelemetry
    from litchai.ai.provider import OllamaProvider
    from litchai.categorize.llm import build_llm_classifier
    from litchai.categorize.pg_memory import PgMemoryStore
    from litchai.crypto import build_decryptor
    from litchai.db.pg import PostgresRepository, connect
    from litchai.documents.state import DocumentStatus
    from litchai.embeddings import OllamaEmbedder
    from litchai.pipeline import categorize_document, extract_document, ingest_document as run_ingest
    from litchai.scanning import build_scanner
    from litchai.storage import Storage
    from litchai.taxonomy import load_taxonomy

    from litchai.ops.sweep import fail_in_flight

    conn = connect()
    try:
        repo = PostgresRepository(conn)
        storage = Storage()
        decrypt = build_decryptor()
        try:
            doc = run_ingest(repo, storage, document_id, scanner=build_scanner(), decrypt=decrypt)
            if doc.status == DocumentStatus.EXTRACTING.value:
                doc = extract_document(repo, storage, document_id, decrypt=decrypt)
            if doc.status == DocumentStatus.EXTRACTED.value:
                taxonomy = load_taxonomy()
                store = PgMemoryStore(conn)
                embedder = OllamaEmbedder()
                llm = build_llm_classifier(
                    OllamaProvider(), taxonomy, cache=PgCache(conn), telemetry=PgTelemetry(conn)
                )
                doc = categorize_document(
                    repo, document_id, store=store, taxonomy=taxonomy,
                    embedder=embedder, llm_classify=llm,
                )
            return doc.status
        except Exception as exc:
            # Any uncaught error (decryptor permissions, Ollama down, OOM, a native
            # extraction crash — anything pipeline.py's own ExtractionError handler
            # doesn't cover) would otherwise leave the document frozen at its
            # in-flight status with no reason and no retry path. Record the failure
            # in the state machine before the job dies, then re-raise so Procrastinate
            # still marks the job failed.
            fail_in_flight(repo, document_id, f"{type(exc).__name__}: {exc}")
            raise
    finally:
        conn.close()


@queue.periodic(cron="*/10 * * * *")
@queue.task(name="litchai.sweep_stale")
def sweep_stale(timestamp: int = 0) -> int:
    """Self-heal orphaned ingestion (runs every 10 min via the periodic deferrer).

    Fails any document stuck in an in-flight status past the grace window with no
    live queue job — the case the ingest job's own ``try/except`` can't catch,
    because a ``kill -9``/OOM/native crash takes the process down before it can
    record anything. ``timestamp`` is the periodic deferrer's argument; unused.
    """
    from datetime import datetime, timezone

    from litchai.db.pg import PostgresRepository, connect
    from litchai.ops.sweep import sweep_stale_documents

    conn = connect()
    try:
        repo = PostgresRepository(conn)

        def has_active_job(document_id: int) -> bool:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM procrastinate_jobs "
                    "WHERE task_name = 'litchai.ingest_document' "
                    "AND status IN ('todo', 'doing') "
                    "AND (args->>'document_id')::bigint = %s LIMIT 1",
                    (document_id,),
                )
                return cur.fetchone() is not None

        def last_activity_at(doc):  # noqa: ANN001 - Document; local seam
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT max(created_at) AS at FROM audit_log "
                    "WHERE entity = 'document' AND entity_id = %s",
                    (doc.id,),
                )
                row = cur.fetchone()
            latest = row["at"] if row else None
            return latest or doc.created_at

        swept = sweep_stale_documents(
            repo,
            has_active_job=has_active_job,
            last_activity_at=last_activity_at,
            now=datetime.now(timezone.utc),
        )
        return len(swept)
    finally:
        conn.close()

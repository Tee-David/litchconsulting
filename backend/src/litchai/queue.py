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


@queue.task(name="litchai.ingest_document")
def ingest_document(document_id: int) -> str:
    """Scan → (Phase 2b) extract a received document. Constructs the production
    seams from the VM environment: psycopg repo, ClamAV scanner, blind-relay
    decryptor. Returns the resulting document status.

    Imports are local so the module stays importable without a database/VM.
    """
    from litchai.crypto import build_decryptor
    from litchai.db.pg import PostgresRepository, connect
    from litchai.documents.state import DocumentStatus
    from litchai.pipeline import extract_document, ingest_document as run_ingest
    from litchai.scanning import build_scanner
    from litchai.storage import Storage

    conn = connect()
    try:
        repo = PostgresRepository(conn)
        storage = Storage()
        decrypt = build_decryptor()
        doc = run_ingest(repo, storage, document_id, scanner=build_scanner(), decrypt=decrypt)
        if doc.status == DocumentStatus.EXTRACTING.value:
            doc = extract_document(repo, storage, document_id, decrypt=decrypt)
        return doc.status
    finally:
        conn.close()

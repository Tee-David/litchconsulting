"""FastAPI backend (PRD §8, §12) — API-only, behind Cloudflare Tunnel + Access.

Binds to loopback on the VM; nothing here is ever publicly exposed. The admin's
server action (the only caller) authenticates with a Cloudflare Access service
token and POSTs the **already-encrypted** blind-relay envelope (PRD §12.6) — the
API stores ciphertext, never plaintext, and the worker decrypts in memory.

Data access goes through the :class:`~litchai.db.repo.Repository` protocol via a
provider stored on ``app.state``; production uses psycopg, tests inject the
in-memory repo (mirrors how the queue swaps in ``InMemoryConnector``).

Run (VM): ``uvicorn litchai.api:app --host 127.0.0.1 --port 8000``
"""
from __future__ import annotations

import hashlib
from collections.abc import Callable, Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Any, ContextManager

from fastapi import Depends, FastAPI, HTTPException, Request

from litchai.db.repo import Repository
from litchai.queue import ingest_document as ingest_task
from litchai.queue import queue
from litchai.storage import Storage

API_VERSION = "0.2.0"

RepoProvider = Callable[[], ContextManager[Repository]]

# Upload guardrails (FR1). The blind-relay envelope adds a little overhead, so
# the ciphertext cap is generous relative to the ~80-page scan worst case.
MAX_UPLOAD_BYTES = 60 * 1024 * 1024
ALLOWED_MIME = {
    "application/pdf",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg",
}


@contextmanager
def _pg_provider() -> Iterator[Repository]:
    from litchai.db.pg import PostgresRepository, connect

    conn = connect()
    try:
        yield PostgresRepository(conn)
    finally:
        conn.close()


@asynccontextmanager
async def _lifespan(app: FastAPI):
    async with queue.open_async():
        yield


def create_app(
    repo_provider: RepoProvider | None = None,
    storage: Storage | None = None,
) -> FastAPI:
    app = FastAPI(title="LitchAI", version=API_VERSION, lifespan=_lifespan)
    app.state.repo_provider = repo_provider or _pg_provider
    app.state.storage = storage or Storage()

    def get_repo() -> Iterator[Repository]:
        with app.state.repo_provider() as repo:
            yield repo

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "service": "litchai", "version": API_VERSION}

    @app.get("/health/queue")
    async def health_queue() -> dict:
        jobs = await queue.job_manager.list_jobs_async()
        return {"status": "ok", "jobs": len(list(jobs))}

    @app.post("/documents", status_code=201)
    async def create_document(
        request: Request,
        client_id: str,
        filename: str,
        mime: str,
        engagement_id: int | None = None,
        account_label: str | None = None,
        repo: Repository = Depends(get_repo),
    ) -> dict[str, Any]:
        # Body is the raw blind-relay ciphertext (application/octet-stream);
        # metadata rides as query params so there's no multipart/base64 overhead.
        if mime not in ALLOWED_MIME:
            raise HTTPException(415, f"unsupported type {mime!r}")
        ciphertext = await request.body()
        if not ciphertext:
            raise HTTPException(400, "empty upload")
        if len(ciphertext) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "upload exceeds size limit")

        # source_hash fingerprints the *ciphertext* — the same value the Vercel
        # blind relay logged; identical bytes for a client are a duplicate.
        source_hash = hashlib.sha256(ciphertext).hexdigest()
        existing = repo.find_document_by_hash(client_id, source_hash)
        if existing is not None:
            return {"document_id": existing.id, "status": existing.status, "duplicate": True}

        app.state.storage.store(client_id, source_hash, ciphertext)
        doc = repo.create_document(
            client_id=client_id,
            filename=filename,
            mime=mime,
            source_hash=source_hash,
            byte_size=len(ciphertext),
            engagement_id=engagement_id,
            account_label=account_label,
        )
        await ingest_task.defer_async(document_id=doc.id)
        return {"document_id": doc.id, "status": doc.status, "duplicate": False}

    @app.get("/documents/{document_id}")
    async def get_document(
        document_id: int, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        doc = repo.get_document(document_id)
        if doc is None:
            raise HTTPException(404, "document not found")
        return {
            "document_id": doc.id,
            "engagement_id": doc.engagement_id,
            "status": doc.status,
            "progress": doc.progress,
            "filename": doc.filename,
            "mime": doc.mime,
            "extraction_engine": doc.extraction_engine,
            "byte_size": doc.byte_size,
        }

    return app


app = create_app()

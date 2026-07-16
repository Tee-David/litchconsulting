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

from litchai.categorize.memory_store import MemoryStore
from litchai.db.repo import Repository
from litchai.queue import ingest_document as ingest_task
from litchai.queue import queue
from litchai.storage import Storage

API_VERSION = "0.3.0"

RepoProvider = Callable[[], ContextManager[Repository]]
StoreProvider = Callable[[], ContextManager[MemoryStore]]
ProviderFactory = Callable[[], Any]  # returns an ai.provider.Provider


def _default_provider() -> Any:
    from litchai.ai.provider import OllamaProvider

    return OllamaProvider()

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


@contextmanager
def _pg_store_provider() -> Iterator[MemoryStore]:
    from litchai.categorize.pg_memory import PgMemoryStore
    from litchai.db.pg import connect

    conn = connect()
    try:
        yield PgMemoryStore(conn)
    finally:
        conn.close()


def _line_item_dict(li) -> dict[str, Any]:
    return {
        "id": li.id,
        "raw_text": li.raw_text,
        "normalized_text": li.normalized_text,
        "direction": li.direction,
        "amount": li.amount,
        "sheet_ref": li.sheet_ref,
        "page_ref": li.page_ref,
        "category_code": li.category_code,
        "category_source": li.category_source,
        "confidence": li.confidence,
        "flags": li.flags,
        "needs_review": li.needs_review,
    }


@asynccontextmanager
async def _lifespan(app: FastAPI):
    async with queue.open_async():
        yield


def create_app(
    repo_provider: RepoProvider | None = None,
    storage: Storage | None = None,
    store_provider: StoreProvider | None = None,
    provider_factory: ProviderFactory | None = None,
) -> FastAPI:
    app = FastAPI(title="LitchAI", version=API_VERSION, lifespan=_lifespan)
    app.state.repo_provider = repo_provider or _pg_provider
    app.state.store_provider = store_provider or _pg_store_provider
    app.state.provider_factory = provider_factory or _default_provider
    app.state.storage = storage or Storage()

    def get_repo() -> Iterator[Repository]:
        with app.state.repo_provider() as repo:
            yield repo

    def get_store() -> Iterator[MemoryStore]:
        with app.state.store_provider() as store:
            yield store

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

    @app.get("/taxonomy")
    async def taxonomy() -> dict[str, Any]:
        from litchai.taxonomy import load_taxonomy

        t = load_taxonomy()
        return {
            "version": t.version,
            "categories": [{"code": c.code, "label": c.label} for c in t.postable_leaves()],
        }

    @app.get("/documents")
    async def list_documents(
        client_id: str | None = None, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        return {
            "documents": [
                {
                    "document_id": d.id,
                    "client_id": d.client_id,
                    "filename": d.filename,
                    "mime": d.mime,
                    "status": d.status,
                    "progress": d.progress,
                    "created_at": d.created_at.isoformat(),
                }
                for d in repo.list_documents(client_id)
            ]
        }

    @app.get("/documents/{document_id}/review")
    async def review_document(
        document_id: int, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        from collections import defaultdict

        from litchai.review.lineage import LineageLine, rollup_figure
        from litchai.review.queue import ReviewItem, rank_review_queue

        doc = repo.get_document(document_id)
        if doc is None:
            raise HTTPException(404, "document not found")
        items = repo.get_line_items(document_id)

        ranked = rank_review_queue(
            [
                ReviewItem(li.id, li.normalized_text, li.amount, li.confidence or 0.0,
                           li.category_source, li.needs_review)
                for li in items
            ],
            only_flagged=False,
        )
        by_cat: dict[str, list] = defaultdict(list)
        for li in items:
            by_cat[li.category_code or "uncategorized"].append(
                LineageLine(li.id, li.category_source, li.confidence)
            )
        lineage = [rollup_figure(cat, lines).__dict__ for cat, lines in sorted(by_cat.items())]

        return {
            "document": {
                "document_id": doc.id,
                "status": doc.status,
                "filename": doc.filename,
                "engagement_id": doc.engagement_id,
            },
            "line_items": [_line_item_dict(li) for li in items],
            "queue": [
                {"line_item_id": r.item.line_item_id, "risk": r.risk, "novelty": r.novelty}
                for r in ranked
            ],
            "lineage": lineage,
        }

    @app.post("/documents/{document_id}/lines/{line_item_id}/recategorize")
    async def recategorize(
        document_id: int,
        line_item_id: int,
        new_code: str,
        repo: Repository = Depends(get_repo),
        store: MemoryStore = Depends(get_store),
    ) -> dict[str, Any]:
        from litchai.review.corrections import CorrectionError, apply_category_correction
        from litchai.taxonomy import load_taxonomy

        from litchai.documents.engagement_state import is_frozen

        doc = repo.get_document(document_id)
        if doc is None:
            raise HTTPException(404, "document not found")
        if doc.engagement_id is not None:
            eng = repo.get_engagement(doc.engagement_id)
            if eng is not None and is_frozen(eng.status):
                raise HTTPException(409, "engagement is locked — reopen it to make corrections")
        li = next((x for x in repo.get_line_items(document_id) if x.id == line_item_id), None)
        if li is None:
            raise HTTPException(404, "line item not found")
        try:
            apply_category_correction(
                repo, store, line_item=li, new_code=new_code,
                taxonomy=load_taxonomy(), client_id=doc.client_id,
            )
        except CorrectionError as exc:
            raise HTTPException(400, str(exc)) from exc
        return {"ok": True, "line_item_id": line_item_id, "category_code": new_code}

    def _engagement_transition(engagement_id: int, to_status: str, repo: Repository,
                               detail: dict[str, Any] | None = None) -> dict[str, Any]:
        from litchai.documents.state import IllegalTransition

        if repo.get_engagement(engagement_id) is None:
            raise HTTPException(404, "engagement not found")
        try:
            eng = repo.transition_engagement(engagement_id, to_status, detail)
        except IllegalTransition as exc:
            raise HTTPException(409, str(exc)) from exc
        return {"engagement_id": eng.id, "status": eng.status}

    @app.post("/engagements/{engagement_id}/submit")
    async def submit_engagement(engagement_id: int, repo: Repository = Depends(get_repo)) -> dict[str, Any]:
        return _engagement_transition(engagement_id, "in_review", repo)

    @app.post("/engagements/{engagement_id}/approve")
    async def approve_engagement(engagement_id: int, repo: Repository = Depends(get_repo)) -> dict[str, Any]:
        result = _engagement_transition(engagement_id, "approved", repo)
        result["deliverables"] = repo.mark_engagement_deliverable(engagement_id)  # freeze → deliverable
        return result

    @app.post("/engagements/{engagement_id}/reject")
    async def reject_engagement(
        engagement_id: int, notes: str | None = None, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        return _engagement_transition(engagement_id, "open", repo, {"notes": notes} if notes else None)

    @app.post("/engagements/{engagement_id}/lock")
    async def lock_engagement(engagement_id: int, repo: Repository = Depends(get_repo)) -> dict[str, Any]:
        return _engagement_transition(engagement_id, "locked", repo)

    @app.post("/engagements/{engagement_id}/reopen")
    async def reopen_engagement(engagement_id: int, repo: Repository = Depends(get_repo)) -> dict[str, Any]:
        return _engagement_transition(engagement_id, "reopened", repo)

    @app.post("/engagements/{engagement_id}/compile")
    async def compile_engagement_endpoint(
        engagement_id: int, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        from litchai.mapping import MappingError
        from litchai.pipeline import compile_engagement
        from litchai.taxonomy import load_taxonomy

        if repo.get_engagement(engagement_id) is None:
            raise HTTPException(404, "engagement not found")
        try:
            result = compile_engagement(repo, engagement_id, taxonomy=load_taxonomy())
        except (MappingError, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc
        pack = result.review_pack.to_dict()
        return {
            "ok": result.ok,
            "generated_file_id": result.generated_file_id,
            "errors": result.errors,
            "anomalies": pack["anomalies"],
            "summaries": pack["summaries"],
        }

    @app.post("/engagements/{engagement_id}/ask")
    async def ask_engagement(
        engagement_id: int, question: str, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        from dataclasses import asdict

        from litchai.pipeline import compile_engagement
        from litchai.review.assistant import answer
        from litchai.taxonomy import load_taxonomy

        if repo.get_engagement(engagement_id) is None:
            raise HTTPException(404, "engagement not found")
        result = compile_engagement(repo, engagement_id, taxonomy=load_taxonomy())
        response = answer(question, result.review_pack, provider=app.state.provider_factory())
        return asdict(response)

    return app


app = create_app()

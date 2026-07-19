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
import os
import time
from collections.abc import Callable, Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Any, ContextManager

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from pydantic import BaseModel

from litchai.categorize.memory_store import MemoryStore
from litchai.db.repo import Repository
from litchai.queue import ingest_document as ingest_task
from litchai.queue import queue
from litchai.storage import Storage

API_VERSION = "0.4.0"

RepoProvider = Callable[[], ContextManager[Repository]]
StoreProvider = Callable[[], ContextManager[MemoryStore]]
ProviderFactory = Callable[[], Any]  # returns an ai.provider.Provider
EmbedderFactory = Callable[[], Any]  # returns an embeddings.Embedder


def _default_provider() -> Any:
    from litchai.ai.provider import OllamaProvider

    return OllamaProvider()


def _default_chat_provider() -> Any:
    """External general-chat provider (OpenAI-compatible), or ``None`` when the
    LITCHAI_CHAT_* env is unset — in which case general chat degrades to a
    grounded refusal. Firm knowledge + client data never use this."""
    from litchai.ai.provider import build_chat_provider

    return build_chat_provider()


def _default_embedder() -> Any:
    from litchai.embeddings import OllamaEmbedder

    return OllamaEmbedder()


class AssistantChatRequest(BaseModel):
    message: str
    history: list[dict[str, str]] | None = None
    scope: str = "firm"           # 'firm' | 'client'
    client_id: str | None = None


class CreateEngagementRequest(BaseModel):
    client_id: str
    period_label: str
    template: str
    aux_inputs: dict[str, Any] | None = None
    materiality: float | None = None


# Only these two templates have a workbook compiler wired (pipeline._VARIANT_FOR_TEMPLATE);
# refuse anything else at creation rather than letting it fail later at compile.
COMPILABLE_TEMPLATES = {"annual_report_ias1", "annual_report_ifrs18"}

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
    embedder_factory: EmbedderFactory | None = None,
    chat_provider_factory: ProviderFactory | None = None,
) -> FastAPI:
    app = FastAPI(title="LitchAI", version=API_VERSION, lifespan=_lifespan)
    app.state.repo_provider = repo_provider or _pg_provider
    app.state.store_provider = store_provider or _pg_store_provider
    app.state.provider_factory = provider_factory or _default_provider
    app.state.embedder_factory = embedder_factory or _default_embedder
    app.state.chat_provider_factory = chat_provider_factory or _default_chat_provider
    app.state.storage = storage or Storage()
    app.state.embedder = None   # built once on first Sage call
    app.state.router = None      # SemanticRouter (tool-utterance index) cached here
    app.state.chat_provider = None        # external general-chat provider (or None)
    app.state.chat_provider_built = False  # sentinel: None is a valid built value

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

    @app.get("/health/model")
    async def health_model() -> dict:
        """Liveness of the *local* model behind the provider seam.

        The admin Integrations page can reach this API (tunnel + Access) but can
        never reach Ollama itself — it's bound to loopback on the VM. So the
        model's real state has to be reported from in here.

        Cheap on purpose: lists the loaded models rather than generating, so it
        stays a liveness probe and never occupies the GPU. ``ok`` means the
        model the pipeline requests is actually present, not merely that Ollama
        answered.
        """
        import httpx  # noqa: PLC0415

        provider = app.state.provider_factory()
        requested = getattr(provider, "request_model", None)
        host = os.environ.get("LITCHAI_OLLAMA_HOST", "http://127.0.0.1:11434")
        base = {
            "provider": getattr(provider, "name", "unknown"),
            "model": requested,
            "digest_pinned": bool(getattr(provider, "model_digest", None)),
        }

        # A non-Ollama provider (e.g. FakeProvider in tests) has no daemon to poll.
        if base["provider"] != "ollama":
            return {**base, "status": "ok", "detail": "non-ollama provider"}

        started = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=3.0) as http:
                resp = await http.get(f"{host}/api/tags")
            resp.raise_for_status()
            tags = resp.json().get("models", [])
        except Exception as exc:  # noqa: BLE001 — a probe must never 500
            return {**base, "status": "down", "detail": type(exc).__name__}

        names = [t.get("name") for t in tags if t.get("name")]
        loaded = requested in names
        return {
            **base,
            "status": "ok" if loaded else "degraded",
            "detail": None if loaded else f"{requested} not pulled on this host",
            "latency_ms": int((time.monotonic() - started) * 1000),
            "models_available": len(names),
        }

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

    @app.get("/documents/{document_id}/result.xlsx")
    async def get_document_result(
        document_id: int, repo: Repository = Depends(get_repo)
    ) -> Response:
        """Stream the compiled deliverable for the document's engagement.

        Compiles are per-engagement, so this resolves document → engagement →
        latest generated file, then reads the workbook back out of the artifact
        store by the sha256 recorded at compile time.
        """
        doc = repo.get_document(document_id)
        if doc is None:
            raise HTTPException(404, "document not found")
        if doc.engagement_id is None:
            raise HTTPException(404, "document is not attached to an engagement")

        gen = repo.latest_generated_file(doc.engagement_id)
        if gen is None or not gen.sha256:
            raise HTTPException(409, "engagement has not been compiled yet")

        storage: Storage = app.state.storage
        if not storage.artifact_exists(gen.sha256):
            # Metadata outlives the blob (e.g. compiled before artifacts were
            # persisted, or the disk was cycled) — recompiling repairs it.
            raise HTTPException(410, "compiled workbook is no longer on disk; recompile")

        filename = f"engagement_{doc.engagement_id}_{gen.template}.xlsx"
        return Response(
            content=storage.read_artifact(gen.sha256),
            media_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

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

    def _engagement_dict(eng: Any) -> dict[str, Any]:
        return {
            "engagement_id": eng.id,
            "client_id": eng.client_id,
            "period_label": eng.period_label,
            "template": eng.template,
            "materiality": eng.materiality,
            "status": eng.status,
        }

    @app.post("/engagements", status_code=201)
    async def create_engagement_endpoint(
        body: CreateEngagementRequest, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        """Create the engagement a compile hangs off. Until this existed nothing
        could reach /compile — the repo call was only ever used by tests."""
        if body.template not in COMPILABLE_TEMPLATES:
            raise HTTPException(
                422,
                f"template {body.template!r} has no workbook compiler "
                f"(expected one of {sorted(COMPILABLE_TEMPLATES)})",
            )
        if not body.client_id.strip() or not body.period_label.strip():
            raise HTTPException(422, "client_id and period_label are required")
        eng = repo.create_engagement(
            body.client_id,
            body.period_label,
            body.template,
            body.aux_inputs,
            body.materiality,
        )
        return _engagement_dict(eng)

    @app.get("/engagements/{engagement_id}")
    async def get_engagement_endpoint(
        engagement_id: int, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        eng = repo.get_engagement(engagement_id)
        if eng is None:
            raise HTTPException(404, "engagement not found")
        out = _engagement_dict(eng)
        gen = repo.latest_generated_file(engagement_id)
        out["latest_generated_file_id"] = gen.id if gen else None
        return out

    @app.post("/engagements/{engagement_id}/documents/{document_id}")
    async def attach_document_endpoint(
        engagement_id: int, document_id: int, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        """Pull an already-ingested document into an engagement so it compiles.
        Uploading with ?engagement_id= covers the happy path; this covers the
        common case of analysing first and deciding the engagement after."""
        eng = repo.get_engagement(engagement_id)
        if eng is None:
            raise HTTPException(404, "engagement not found")
        doc = repo.get_document(document_id)
        if doc is None:
            raise HTTPException(404, "document not found")
        if doc.client_id != eng.client_id:
            raise HTTPException(409, "document belongs to a different client")
        doc = repo.set_document_engagement(document_id, engagement_id)
        return {"document_id": doc.id, "engagement_id": doc.engagement_id, "status": doc.status}

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

    @app.get("/observability")
    async def observability(repo: Repository = Depends(get_repo)) -> dict[str, Any]:
        from litchai.ops.observability import summarize

        return summarize(repo.list_documents(limit=5000), repo.all_categorization_events())

    @app.post("/clients/{client_id}/erase")
    async def erase_client_endpoint(
        client_id: str, repo: Repository = Depends(get_repo), store: MemoryStore = Depends(get_store)
    ) -> dict[str, Any]:
        from dataclasses import asdict

        from litchai.ops.erasure import erase_client

        return asdict(erase_client(repo, store, client_id))

    @app.post("/engagements/{engagement_id}/compile")
    async def compile_engagement_endpoint(
        engagement_id: int, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        from litchai.mapping import MappingError
        from litchai.pipeline import compile_engagement
        from litchai.taxonomy import load_taxonomy

        if repo.get_engagement(engagement_id) is None:
            raise HTTPException(404, "engagement not found")
        # Compiles run for minutes (LibreOffice recompute) — refuse a second one
        # rather than queueing behind it or racing the generated_files write.
        if not repo.try_compile_lock(engagement_id):
            raise HTTPException(409, "a compile is already running for this engagement")
        try:
            result = compile_engagement(
                repo, engagement_id, taxonomy=load_taxonomy(), storage=app.state.storage
            )
        except (MappingError, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc
        finally:
            repo.release_compile_lock(engagement_id)
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
        result = compile_engagement(
            repo, engagement_id, taxonomy=load_taxonomy(), storage=app.state.storage
        )
        response = answer(question, result.review_pack, provider=app.state.provider_factory())
        return asdict(response)

    def _get_embedder():
        if app.state.embedder is None:
            app.state.embedder = app.state.embedder_factory()
        return app.state.embedder

    def _get_router(embedder):
        from litchai.ai.assistant import SemanticRouter

        if app.state.router is None:
            app.state.router = SemanticRouter(embedder)
        return app.state.router

    def _get_chat_provider():
        # Built once (like the embedder/router). None is a valid result — it just
        # means general chat degrades to a grounded refusal — so a sentinel flag,
        # not `is None`, decides whether we've already tried.
        if not app.state.chat_provider_built:
            app.state.chat_provider = app.state.chat_provider_factory()
            app.state.chat_provider_built = True
        return app.state.chat_provider

    @app.post("/assistant/chat")
    async def assistant_chat(
        body: AssistantChatRequest, repo: Repository = Depends(get_repo)
    ) -> dict[str, Any]:
        """Admin Copilot: semantic tool-routing → grounded RAG answer. READ tools
        return data, WRITE tools return a proposal only (never executed here)."""
        from dataclasses import asdict

        from litchai.ai.assistant import answer_chat

        if not body.message.strip():
            raise HTTPException(400, "message is required")
        if body.scope == "client" and not body.client_id:
            raise HTTPException(400, "client_id is required when scope='client'")

        embedder = _get_embedder()
        router = _get_router(embedder)
        # Reuse the harness cache + ai_calls telemetry when we're on Postgres.
        conn = getattr(repo, "conn", None)
        cache = telemetry = None
        if conn is not None:
            from litchai.ai.pg import PgCache, PgTelemetry

            cache, telemetry = PgCache(conn), PgTelemetry(conn)

        result = answer_chat(
            body.message,
            repo=repo,
            embedder=embedder,
            provider=app.state.provider_factory(),
            router=router,
            history=body.history,
            scope=body.scope,
            client_id=body.client_id,
            chat_provider=_get_chat_provider(),
            cache=cache,
            telemetry=telemetry,
        )
        return asdict(result)

    @app.post("/knowledge/reindex")
    async def knowledge_reindex(repo: Repository = Depends(get_repo)) -> dict[str, Any]:
        """Rebuild the firm-global RAG store from the seed corpus + tax config."""
        from dataclasses import asdict

        from litchai.knowledge import reindex

        result = reindex(repo, _get_embedder())
        return asdict(result)

    return app


app = create_app()

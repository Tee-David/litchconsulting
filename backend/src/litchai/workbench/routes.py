"""HTTP contract for the co-pilot workbench (registered by ``litchai.api``).

All routes sit behind the same Cloudflare Tunnel + Access service token as the
rest of the API; the frontend's server code is the only caller and does the
user/role checks (staff only see assigned requests) before calling here.

Streaming: ``POST /workbench/conversations/{id}/messages`` returns
``text/event-stream`` — one ``event: <type>`` + ``data: <json>`` frame per
harness step (start, provider, fallback, plan, tool_call, tool_result, retry,
final | error). ``?stream=false`` returns the same events as one JSON body.
"""
from __future__ import annotations

import base64
import json
import os
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from litchai.workbench.session import (
    AI_MODES,
    Conversation,
    InMemoryConversationStore,
    StorageBlobStore,
    Workbench,
    WorkbenchError,
)

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class StartConversation(BaseModel):
    client_id: str | None = None
    document_ids: list[int] = Field(default_factory=list)
    ai_mode: str = "cloud_masked"          # the frontend's client.ai_mode
    client_name: str = "Client"
    period_label: str = ""
    title: str = "Workbench"
    blank_workbook: str | None = None      # name → start with an empty workbook


class AttachDocuments(BaseModel):
    document_ids: list[int] = Field(min_length=1)


class UploadWorkbook(BaseModel):
    name: str
    xlsx_base64: str


class SendMessage(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    selection: str | None = None           # optional hint only — never required
    max_steps: int = Field(8, ge=1, le=8)


class UpdateConversation(BaseModel):
    ai_mode: str | None = None
    title: str | None = None
    period_label: str | None = None
    client_name: str | None = None


class AcceptBatch(BaseModel):
    edits: dict[int, dict[str, Any]] | None = None


class RunTool(BaseModel):
    args: dict[str, Any] = Field(default_factory=dict)


class ChartPreview(BaseModel):
    workbook_id: str | None = None
    spec: dict[str, Any]


def register_workbench_routes(app: FastAPI) -> None:
    state = app.state
    state.wb_memory_store = InMemoryConversationStore()

    @contextmanager
    def _workbench() -> Iterator[Workbench]:
        with state.repo_provider() as repo:
            conn = getattr(repo, "conn", None)
            if conn is not None:
                from litchai.workbench.session import PgConversationStore

                store: Any = PgConversationStore(conn)
            else:
                store = state.wb_memory_store
            wb = Workbench(StorageBlobStore(state.storage), store, gate=state.workbench_gate)
            wb.repo = repo  # type: ignore[attr-defined]
            yield wb

    def _router() -> Any:
        if getattr(state, "ai_router", None) is None:
            state.ai_router = state.router_factory()
        return state.ai_router

    def _taxonomy() -> Any:
        from litchai.taxonomy import load_taxonomy

        return load_taxonomy()

    def _categoriser(repo: Any, client_id: str | None) -> Callable | None:
        """The real categorisation ladder (memory store + embedder) when wired;
        None falls back to taxonomy keywords inside categorise_rows."""
        factory = getattr(state, "categoriser_factory", None)
        return factory(repo, client_id) if factory else None

    def _get(wb: Workbench, conversation_id: str) -> Conversation:
        conv = wb.store.get(conversation_id)
        if conv is None:
            raise HTTPException(404, "conversation not found")
        return conv

    def _attach_document(wb: Workbench, conv: Conversation, document_id: int) -> None:
        from litchai.workbench.model import from_line_items, load_csv, to_xlsx_bytes

        repo = wb.repo  # type: ignore[attr-defined]
        doc = repo.get_document(document_id)
        if doc is None:
            raise HTTPException(404, f"document {document_id} not found")
        if conv.client_id and doc.client_id != conv.client_id:
            raise HTTPException(409, f"document {document_id} belongs to a different client")
        name = doc.filename
        low = name.lower()
        is_sheet = low.endswith((".xlsx", ".xlsm")) or doc.mime == XLSX_MIME
        is_csv = low.endswith(".csv") or doc.mime == "text/csv"
        if is_sheet or is_csv:
            try:
                plain = state.decryptor(state.storage.read(doc.client_id, doc.source_hash))
            except FileNotFoundError as exc:
                raise HTTPException(410, f"document {document_id} file is gone") from exc
            try:
                data = plain if is_sheet else to_xlsx_bytes(
                    load_csv(plain, wb_id=f"doc-{doc.id}", name=name))
                wb.attach_bytes(conv, data, name=name, origin="xlsx" if is_sheet else "csv",
                                document_id=doc.id)
            except HTTPException:
                raise
            except Exception as exc:  # a damaged file: tell the user, not a 500
                raise HTTPException(422, f"unreadable file: {name} could not be opened "
                                    f"({type(exc).__name__})") from exc
        else:
            items = repo.get_line_items(doc.id)
            if not items:
                raise HTTPException(409, f"document {document_id} has no extracted rows yet "
                                    f"(status {doc.status})")
            model = from_line_items(items, wb_id=f"doc-{doc.id}", name=name, document_id=doc.id)
            wb.attach_model(conv, model)

    def _deps(wb: Workbench, conv: Conversation) -> Any:
        from litchai.workbench.engine import TurnDeps

        return TurnDeps(wb, _router(), taxonomy=_taxonomy(),
                        categoriser=_categoriser(wb.repo, conv.client_id))  # type: ignore[attr-defined]

    # --- provider / engine status ------------------------------------------------
    @app.get("/ai/providers")
    async def ai_providers(probe: bool = False) -> dict[str, Any]:
        """Chain, health (real 1-token probe when ?probe=true, else cached) and
        today's quota use per provider. Never returns keys."""
        router = _router()
        return {"chain": router.status(probe=probe),
                "local_only_chain": [s.name for s in router.chain(local_only=True)]}

    # --- conversations -----------------------------------------------------------
    @app.post("/workbench/conversations", status_code=201)
    def start_conversation(body: StartConversation) -> dict[str, Any]:
        from litchai.workbench.engine import first_look
        from litchai.workbench.model import new_workbook

        if body.ai_mode not in AI_MODES:
            raise HTTPException(422, f"ai_mode must be one of {AI_MODES}")
        if not body.document_ids and not body.blank_workbook:
            raise HTTPException(422, "attach at least one document or ask for a blank workbook")
        with _workbench() as wb:
            conv = wb.create(client_id=body.client_id, ai_mode=body.ai_mode, title=body.title,
                             client_name=body.client_name, period_label=body.period_label)
            for doc_id in body.document_ids:
                _attach_document(wb, conv, doc_id)
            if body.blank_workbook:
                conv.new_seq += 1
                blank = new_workbook(f"new-{conv.new_seq}", body.blank_workbook)
                wb.attach_model(conv, blank)
            look = first_look(_deps(wb, conv), conv)
            wb.store.save(conv)
            return {"conversation": conv.public(), "first_look": look}

    @app.get("/workbench/conversations")
    def list_conversations(client_id: str | None = None, limit: int = 50) -> dict[str, Any]:
        with _workbench() as wb:
            return {"conversations": [
                {k: v for k, v in c.public().items() if k not in ("messages", "batches")}
                for c in wb.store.list(client_id, min(limit, 200))]}

    @app.get("/workbench/conversations/{conversation_id}")
    def get_conversation(conversation_id: str) -> dict[str, Any]:
        with _workbench() as wb:
            return {"conversation": _get(wb, conversation_id).public()}

    @app.patch("/workbench/conversations/{conversation_id}")
    def update_conversation(conversation_id: str, body: UpdateConversation) -> dict[str, Any]:
        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            if body.ai_mode is not None:
                if body.ai_mode not in AI_MODES:
                    raise HTTPException(422, f"ai_mode must be one of {AI_MODES}")
                conv.ai_mode = body.ai_mode
            for k in ("title", "period_label", "client_name"):
                v = getattr(body, k)
                if v is not None:
                    setattr(conv, k, v)
            wb.store.save(conv)
            return {"conversation": conv.public()}

    @app.post("/workbench/conversations/{conversation_id}/documents")
    def attach_documents(conversation_id: str, body: AttachDocuments) -> dict[str, Any]:
        from litchai.workbench.engine import first_look

        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            for doc_id in body.document_ids:
                _attach_document(wb, conv, doc_id)
            look = first_look(_deps(wb, conv), conv)
            wb.store.save(conv)
            return {"conversation": conv.public(), "first_look": look}

    @app.post("/workbench/conversations/{conversation_id}/workbooks")
    def upload_workbook(conversation_id: str, body: UploadWorkbook) -> dict[str, Any]:
        """Attach an xlsx the admin produced in the workbench (not a client upload)."""
        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            try:
                data = base64.b64decode(body.xlsx_base64, validate=True)
                ref = wb.attach_bytes(conv, data, name=body.name)
            except (ValueError, OSError) as exc:
                raise HTTPException(422, f"unreadable file: not a usable xlsx ({exc})") from exc
            wb.store.save(conv)
            return {"workbook": ref.__dict__}

    @app.get("/workbench/conversations/{conversation_id}/first-look")
    def get_first_look(conversation_id: str) -> dict[str, Any]:
        from litchai.workbench.engine import first_look

        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            return first_look(_deps(wb, conv), conv)

    # --- the agent turn (streamed) ---------------------------------------------------
    @app.post("/workbench/conversations/{conversation_id}/messages")
    def send_message(conversation_id: str, body: SendMessage, stream: bool = True) -> Any:
        from litchai.workbench.engine import run_turn

        # Validate before streaming so a 404 is a real 404, not a broken stream.
        with _workbench() as wb:
            _get(wb, conversation_id)

        def events() -> Iterator[dict[str, Any]]:
            with _workbench() as wb:
                conv = _get(wb, conversation_id)
                yield from run_turn(_deps(wb, conv), conv, body.message,
                                    selection=body.selection, max_steps=body.max_steps)

        if not stream:
            out = list(events())
            return {"events": out, "final": out[-1] if out else None}

        def sse() -> Iterator[str]:
            try:
                for ev in events():
                    yield f"event: {ev['type']}\ndata: {json.dumps(ev, default=str)}\n\n"
            except Exception as exc:  # noqa: BLE001 — surface as an event, never a torn stream
                err = {"type": "error", "message": f"{type(exc).__name__}: {exc}"[:300]}
                yield f"event: error\ndata: {json.dumps(err)}\n\n"

        return StreamingResponse(sse(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no"})

    @app.post("/workbench/conversations/{conversation_id}/tools/{tool}")
    def run_tool_direct(conversation_id: str, tool: str, body: RunTool) -> dict[str, Any]:
        """Run one deterministic tool without the model (suggestion chips,
        "Reconcile bank to ledger" buttons). Writes still come back as proposals."""
        from litchai.ai.decision import HeuristicDecisionLayer, gate_batch
        from litchai.workbench.context import ToolError
        from litchai.workbench.tools import run_tool

        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            ctx = wb.context(conv, taxonomy=_taxonomy(),
                             categoriser=_categoriser(wb.repo, conv.client_id))  # type: ignore[attr-defined]
            try:
                out = run_tool(ctx, tool, body.args)
            except ToolError as exc:
                raise HTTPException(422, str(exc)) from exc
            result = out.to_dict()
            if out.batch is not None:
                wb.add_batch(conv, out.batch)
                gate = gate_batch(HeuristicDecisionLayer(), out.batch)
                result["batch"]["risk"] = gate.choice
                result["batch"]["risk_reasons"] = gate.reasons
                wb.store.save(conv)
            return result

    # --- proposals --------------------------------------------------------------------
    @app.get("/workbench/conversations/{conversation_id}/batches")
    def list_batches(conversation_id: str, status: str | None = None) -> dict[str, Any]:
        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            return {"batches": [b.to_dict() for b in conv.batches
                                if status is None or b.status == status]}

    def _decide(conversation_id: str, batch_id: str, action: str,
                edits: dict[int, dict[str, Any]] | None = None) -> dict[str, Any]:
        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            try:
                if action == "accept":
                    b = wb.accept(conv, batch_id, edits)
                elif action == "reject":
                    b = wb.reject(conv, batch_id)
                else:
                    b = wb.undo(conv, batch_id)
            except KeyError as exc:
                raise HTTPException(404, "batch not found") from exc
            except WorkbenchError as exc:
                raise HTTPException(409, str(exc)) from exc
            wb.store.save(conv)
            return {"batch": b.to_dict(), "conversation": conv.public()}

    @app.post("/workbench/conversations/{conversation_id}/batches/{batch_id}/accept")
    def accept_batch(conversation_id: str, batch_id: str,
                     body: AcceptBatch | None = None) -> dict[str, Any]:
        return _decide(conversation_id, batch_id, "accept", body.edits if body else None)

    @app.post("/workbench/conversations/{conversation_id}/batches/{batch_id}/reject")
    def reject_batch(conversation_id: str, batch_id: str) -> dict[str, Any]:
        return _decide(conversation_id, batch_id, "reject")

    @app.post("/workbench/conversations/{conversation_id}/batches/{batch_id}/undo")
    def undo_batch(conversation_id: str, batch_id: str) -> dict[str, Any]:
        return _decide(conversation_id, batch_id, "undo")

    # --- workbooks / charts -----------------------------------------------------------
    @app.get("/workbench/conversations/{conversation_id}/workbooks/{workbook_id}.xlsx")
    def download_workbook(conversation_id: str, workbook_id: str,
                          version: int | None = None) -> Response:
        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            try:
                data = wb.download(conv, workbook_id, version)
                ref = conv.workbook_ref(workbook_id)
            except (KeyError, WorkbenchError) as exc:
                raise HTTPException(404, str(exc)) from exc
            name = os.path.splitext(ref.name)[0] or workbook_id
            return Response(content=data, media_type=XLSX_MIME, headers={
                "Content-Disposition": f'attachment; filename="{name}.xlsx"'})

    @app.get("/workbench/conversations/{conversation_id}/workbooks/{workbook_id}/verified.xlsx")
    def verified_workbook(conversation_id: str, workbook_id: str) -> Response:
        """The current version, through the recompute gate. Every final action
        (download, save draft for the client, send) uses this. 409 with the errors
        when the gate blocks; otherwise the bytes plus X-Gate-* headers. An
        ``unverified`` gate (LibreOffice unavailable) is returned, never hidden."""
        from litchai.workbench.ops import libreoffice_gate

        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            try:
                data = wb.download(conv, workbook_id)
                ref = conv.workbook_ref(workbook_id)
            except (KeyError, WorkbenchError) as exc:
                raise HTTPException(404, str(exc)) from exc
        gate = (state.workbench_gate or libreoffice_gate)(data)
        g = gate.to_dict()
        if gate.status == "blocked":
            raise HTTPException(409, {"message": "The recompute gate found formula errors.",
                                      "gate": g})
        name = os.path.splitext(ref.name)[0] or workbook_id
        return Response(content=gate.recomputed or data, media_type=XLSX_MIME, headers={
            "Content-Disposition": f'attachment; filename="{name}.xlsx"',
            "X-Gate-Status": gate.status, "X-Gate-Formulas": str(gate.formulas),
            "X-Gate-Version": str(len(ref.versions)),
            "X-Gate-Detail": (gate.detail or "")[:200].encode("ascii", "replace").decode()})

    @app.get("/workbench/conversations/{conversation_id}/workbooks/{workbook_id}/sheets/{sheet}")
    def sheet_cells(conversation_id: str, workbook_id: str, sheet: str, r0: int = 1,
                    r1: int = 200, c0: int = 1, c1: int = 52) -> dict[str, Any]:
        """A window of one sheet for the grid: value, formula, preview, and the
        pending batch (diff colour + why) for each cell."""
        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            models = wb.models(conv)
            if workbook_id not in models:
                raise HTTPException(404, "workbook not found")
            try:
                sh = models[workbook_id].sheet(sheet)
            except KeyError as exc:
                raise HTTPException(404, str(exc)) from exc
            pending: dict[tuple[str, str], dict[str, Any]] = {}
            for b in conv.batches:
                if b.status != "pending":
                    continue
                for op in b.ops:
                    if op.op == "set_cell" and op.workbook_id == workbook_id \
                            and op.sheet == sh.name:
                        pending[(op.sheet, op.cell or "")] = {
                            "batch_id": b.id, "kind": op.kind, "reason": op.reason,
                            "tool": op.tool, "source_rows": op.source_rows[:20],
                            "old_value": op.to_dict()["old_value"], "old_formula": op.old_formula}
            from litchai.workbench.model import a1

            r1, c1 = min(r1, r0 + 2000), min(c1, c0 + 200)
            cells = []
            for (r, c), cell in sh.cells.items():
                if not (r0 <= r <= r1 and c0 <= c <= c1):
                    continue
                ref = a1(r, c)
                v = cell.display
                cells.append({"ref": ref, "r": r, "c": c,
                              "v": v.isoformat() if hasattr(v, "isoformat") else v,
                              "f": cell.formula, "nf": cell.number_format,
                              "pending": pending.get((sh.name, ref)),
                              "page": sh.source_pages.get(r)})
            return {"sheet": sh.name, "max_row": sh.max_row, "max_col": sh.max_col,
                    "sheets": list(models[workbook_id].sheets), "cells": cells}

    @app.post("/workbench/conversations/{conversation_id}/charts/preview")
    def chart_preview(conversation_id: str, body: ChartPreview) -> dict[str, Any]:
        from litchai.workbench.charts import ChartError, preview

        with _workbench() as wb:
            conv = _get(wb, conversation_id)
            models = wb.models(conv)
            model = models.get(body.workbook_id) if body.workbook_id else next(
                iter(models.values()), None)
            if model is None:
                raise HTTPException(404, "workbook not found")
            try:
                return preview(model, body.spec)
            except (ChartError, KeyError, ValueError) as exc:
                raise HTTPException(422, str(exc)) from exc

    # --- document profile ---------------------------------------------------------------
    @app.get("/documents/{document_id}/profile")
    def document_profile(document_id: int, level: int = 3) -> dict[str, Any]:
        """Every sheet's profile (dims → types → stats) for one document."""
        from litchai.workbench.profile import profile_workbook

        if level not in (1, 2, 3):
            raise HTTPException(422, "level must be 1, 2 or 3")
        from litchai.workbench.session import InMemoryBlobStore

        with state.repo_provider() as repo:
            wb = Workbench(InMemoryBlobStore(), InMemoryConversationStore())  # nothing persisted
            wb.repo = repo  # type: ignore[attr-defined]
            conv = wb.create(client_id=None)
            _attach_document(wb, conv, document_id)
            models = wb.models(conv, with_pending=False)
            return profile_workbook(next(iter(models.values())), level)


"""Workbench conversations: attached workbooks, versions, proposals, messages.

A conversation holds one or more workbooks (each attached document, plus any
new workbook the AI proposes). Every workbook has a version history of
content-addressed xlsx bytes; the *current* version plus every *pending* batch
(overlaid in memory) is what the tools see. Accepting a batch applies its
operation log with openpyxl onto the current bytes, runs the recompute gate and
— only if the gate doesn't block — records a new version. Undo applies the
inverse log the same way, so history is append-only.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from litchai.workbench.context import ToolContext
from litchai.workbench.model import Workbook, load_xlsx, new_workbook, to_xlsx_bytes
from litchai.workbench.ops import (
    ApplyConflict,
    Batch,
    Gate,
    gate_and_apply,
    inverse_batch,
    overlay,
)

AI_MODES = ("cloud_masked", "local_only")
_PLACEHOLDER = "_litchai_new_"


def _now() -> str:
    return datetime.now(UTC).isoformat()


# --- byte + conversation stores ----------------------------------------------------
class BlobStore(Protocol):
    def put(self, data: bytes) -> str: ...
    def get(self, sha: str) -> bytes: ...


class InMemoryBlobStore:
    def __init__(self) -> None:
        self._d: dict[str, bytes] = {}

    def put(self, data: bytes) -> str:
        sha = hashlib.sha256(data).hexdigest()
        self._d[sha] = data
        return sha

    def get(self, sha: str) -> bytes:
        return self._d[sha]


class StorageBlobStore:
    """VM disk via :class:`litchai.storage.Storage` artifacts (0600, OCI-encrypted
    at rest) — the same tree compiled deliverables live in."""

    def __init__(self, storage: Any) -> None:
        self.storage = storage

    def put(self, data: bytes) -> str:
        sha = hashlib.sha256(data).hexdigest()
        if not self.storage.artifact_exists(sha):
            self.storage.store_artifact(sha, data)
        return sha

    def get(self, sha: str) -> bytes:
        return self.storage.read_artifact(sha)


@dataclass
class WorkbookRef:
    id: str
    name: str
    origin: str
    document_id: int | None = None
    versions: list[dict[str, Any]] = field(default_factory=list)  # {n, sha, at, batch_id, gate}
    # The original file when this is a converted working copy:
    # {filename, format, converted, notes}. The original stays untouched.
    source: dict[str, Any] | None = None

    @property
    def current_sha(self) -> str:
        return self.versions[-1]["sha"]


@dataclass
class Conversation:
    id: str
    client_id: str | None = None
    ai_mode: str = "cloud_masked"
    title: str = "Workbench"
    client_name: str = "Client"
    period_label: str = ""
    workbooks: list[WorkbookRef] = field(default_factory=list)
    batches: list[Batch] = field(default_factory=list)
    messages: list[dict[str, Any]] = field(default_factory=list)
    provider: str | None = None
    mask_state: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)
    new_seq: int = 0

    @property
    def local_only(self) -> bool:
        return self.ai_mode == "local_only"

    def batch(self, batch_id: str) -> Batch:
        for b in self.batches:
            if b.id == batch_id:
                return b
        raise KeyError(batch_id)

    def workbook_ref(self, wb_id: str) -> WorkbookRef:
        for w in self.workbooks:
            if w.id == wb_id:
                return w
        raise KeyError(wb_id)

    def state(self) -> dict[str, Any]:
        """JSON state (mask_state is stored separately and never returned)."""
        return {
            "id": self.id, "client_id": self.client_id, "ai_mode": self.ai_mode,
            "title": self.title, "client_name": self.client_name,
            "period_label": self.period_label, "provider": self.provider,
            "created_at": self.created_at, "updated_at": self.updated_at,
            "new_seq": self.new_seq,
            "workbooks": [w.__dict__ for w in self.workbooks],
            "batches": [b.to_dict() for b in self.batches],
            "messages": self.messages,
        }

    def public(self) -> dict[str, Any]:
        s = self.state()
        s["pending"] = sum(1 for b in self.batches if b.status == "pending")
        return s

    @classmethod
    def from_state(cls, state: dict[str, Any], mask_state: dict[str, Any] | None = None
                   ) -> Conversation:
        c = cls(id=state["id"])
        for k in ("client_id", "ai_mode", "title", "client_name", "period_label", "provider",
                  "created_at", "updated_at", "new_seq"):
            if k in state:
                setattr(c, k, state[k])
        c.workbooks = [WorkbookRef(**w) for w in state.get("workbooks", [])]
        c.batches = [Batch.from_dict(b) for b in state.get("batches", [])]
        c.messages = list(state.get("messages", []))
        c.mask_state = mask_state or {}
        return c


class ConversationStore(Protocol):
    def get(self, conversation_id: str) -> Conversation | None: ...
    def save(self, conversation: Conversation) -> None: ...
    def list(self, client_id: str | None = None, limit: int = 50) -> list[Conversation]: ...


class InMemoryConversationStore:
    def __init__(self) -> None:
        self._d: dict[str, str] = {}
        self._masks: dict[str, dict] = {}

    def get(self, conversation_id: str) -> Conversation | None:
        raw = self._d.get(conversation_id)
        if raw is None:
            return None
        return Conversation.from_state(json.loads(raw), self._masks.get(conversation_id))

    def save(self, conversation: Conversation) -> None:
        conversation.updated_at = _now()
        self._d[conversation.id] = json.dumps(conversation.state(), default=str)
        self._masks[conversation.id] = conversation.mask_state

    def list(self, client_id: str | None = None, limit: int = 50) -> list[Conversation]:
        out = [c for c in (self.get(k) for k in self._d) if c is not None
               and (client_id is None or c.client_id == client_id)]
        return sorted(out, key=lambda c: c.updated_at, reverse=True)[:limit]


class PgConversationStore:
    def __init__(self, conn: Any) -> None:
        self.conn = conn

    def get(self, conversation_id: str) -> Conversation | None:
        with self.conn.cursor() as cur:
            cur.execute("SELECT state, mask_state FROM wb_conversation WHERE id = %s",
                        (conversation_id,))
            row = cur.fetchone()
        return Conversation.from_state(row["state"], row["mask_state"]) if row else None

    def save(self, conversation: Conversation) -> None:
        from psycopg.types.json import Jsonb

        conversation.updated_at = _now()
        state = json.loads(json.dumps(conversation.state(), default=str))
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO wb_conversation (id, client_id, ai_mode, state, mask_state) "
                "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET "
                "ai_mode = EXCLUDED.ai_mode, state = EXCLUDED.state, "
                "mask_state = EXCLUDED.mask_state, updated_at = now()",
                (conversation.id, conversation.client_id, conversation.ai_mode, Jsonb(state),
                 Jsonb(conversation.mask_state)),
            )

    def list(self, client_id: str | None = None, limit: int = 50) -> list[Conversation]:
        with self.conn.cursor() as cur:
            if client_id:
                cur.execute("SELECT state, mask_state FROM wb_conversation WHERE client_id = %s "
                            "ORDER BY updated_at DESC LIMIT %s", (client_id, limit))
            else:
                cur.execute("SELECT state, mask_state FROM wb_conversation "
                            "ORDER BY updated_at DESC LIMIT %s", (limit,))
            rows = cur.fetchall()
        return [Conversation.from_state(r["state"], r["mask_state"]) for r in rows]


# --- the service ---------------------------------------------------------------------
class WorkbenchError(ValueError):
    pass


@dataclass
class Workbench:
    blobs: BlobStore
    store: ConversationStore
    gate: Gate | None = None

    def create(self, *, client_id: str | None, ai_mode: str = "cloud_masked",
               title: str = "Workbench", client_name: str = "Client",
               period_label: str = "") -> Conversation:
        if ai_mode not in AI_MODES:
            raise WorkbenchError(f"ai_mode must be one of {AI_MODES}")
        conv = Conversation(id=f"wb-{uuid.uuid4().hex[:12]}", client_id=client_id,
                            ai_mode=ai_mode, title=title, client_name=client_name,
                            period_label=period_label)
        return conv

    def attach_bytes(self, conv: Conversation, data: bytes, *, name: str, origin: str = "xlsx",
                     document_id: int | None = None,
                     source: dict[str, Any] | None = None) -> WorkbookRef:
        wb_id = f"doc-{document_id}" if document_id is not None else f"file-{len(conv.workbooks)+1}"
        if any(w.id == wb_id for w in conv.workbooks):
            return conv.workbook_ref(wb_id)
        load_xlsx(data, wb_id=wb_id, name=name)  # validate it opens (zip-bomb guard inside)
        sha = self.blobs.put(data)
        ref = WorkbookRef(id=wb_id, name=name, origin=origin, document_id=document_id,
                          versions=[{"n": 1, "sha": sha, "at": _now(), "batch_id": None,
                                     "gate": None}], source=source)
        conv.workbooks.append(ref)
        return ref

    def attach_model(self, conv: Conversation, model: Workbook) -> WorkbookRef:
        return self.attach_bytes(conv, to_xlsx_bytes(model), name=model.name,
                                 origin=model.origin, document_id=model.document_id)

    # -- context ------------------------------------------------------------------
    def models(self, conv: Conversation, *, with_pending: bool = True) -> dict[str, Workbook]:
        out: dict[str, Workbook] = {}
        for ref in conv.workbooks:
            out[ref.id] = load_xlsx(self.blobs.get(ref.current_sha), wb_id=ref.id, name=ref.name,
                                    document_id=ref.document_id)
            out[ref.id].origin = ref.origin
        # Sheets Sage made and you accepted (and did not undo): these may be rebuilt.
        for b in conv.batches:
            if b.status != "accepted":
                continue
            for op in b.ops:
                if op.workbook_id in out and op.sheet:
                    if op.op == "create_sheet":
                        out[op.workbook_id].generated.add(op.sheet)
                    elif op.op == "delete_sheet":
                        out[op.workbook_id].generated.discard(op.sheet)
                    elif op.op == "rename_sheet" and op.sheet in out[op.workbook_id].generated:
                        out[op.workbook_id].generated.discard(op.sheet)
                        out[op.workbook_id].generated.add(str((op.meta or {}).get("to")))
        if with_pending:
            for b in conv.batches:
                if b.status != "pending":
                    continue
                for op in b.ops:
                    if op.op == "create_workbook" and op.workbook_id not in out:
                        out[op.workbook_id] = new_workbook(op.workbook_id,
                                                           str(op.new_value or op.workbook_id))
                for wid in {op.workbook_id for op in b.ops}:
                    if wid in out:
                        overlay(out[wid], [op for op in b.ops if op.workbook_id == wid])
        return out

    def context(self, conv: Conversation, **kw: Any) -> ToolContext:
        ctx = ToolContext(self.models(conv), client_name=conv.client_name,
                          period_label=conv.period_label, **kw)
        ctx.new_workbook_seq = conv.new_seq + sum(
            1 for b in conv.batches for op in b.ops if op.op == "create_workbook")
        return ctx

    def add_batch(self, conv: Conversation, batch: Batch, step: int | None = None) -> Batch:
        batch.step = step
        _supersede(conv, batch)
        conv.batches.append(batch)
        return batch

    # -- decisions --------------------------------------------------------------------
    def reject(self, conv: Conversation, batch_id: str) -> Batch:
        b = conv.batch(batch_id)
        if b.status != "pending":
            raise WorkbenchError(f"batch is {b.status}, not pending")
        b.status, b.decided_at = "rejected", _now()
        return b

    def accept(self, conv: Conversation, batch_id: str,
               edits: dict[int, dict[str, Any]] | None = None) -> Batch:
        """Apply → gate → new version. ``edits`` maps op index → {new_value |
        new_formula} so a reviewer can tweak a cell before accepting ("Edit")."""
        b = conv.batch(batch_id)
        if b.status not in ("pending", "blocked"):
            raise WorkbenchError(f"batch is {b.status}, not pending")
        for idx, change in (edits or {}).items():
            if not 0 <= idx < len(b.ops) or b.ops[idx].op != "set_cell":
                raise WorkbenchError(f"op {idx} is not an editable cell")
            op = b.ops[idx]
            if change.get("new_formula"):
                from litchai.workbench.formula import FormulaError, check_formula

                f = str(change["new_formula"])
                f = f if f.startswith("=") else "=" + f
                try:
                    check_formula(f)
                except FormulaError as exc:
                    raise WorkbenchError(f"op {idx}: {exc}") from exc
                op.new_formula, op.new_value = f, None
            elif "new_value" in change:
                op.new_value, op.new_formula = change["new_value"], None
            op.reason = (op.reason + " · edited by reviewer").strip(" ·")
        return self._apply(conv, b, record_as=b)

    def undo(self, conv: Conversation, batch_id: str) -> Batch:
        b = conv.batch(batch_id)
        if b.status != "accepted":
            raise WorkbenchError(f"only an accepted batch can be undone (this one is {b.status})")
        inv = inverse_batch(b)
        conv.batches.append(inv)
        self._apply(conv, inv, record_as=inv)
        if inv.status == "accepted":
            b.status, b.decided_at = "undone", _now()
        return inv

    def _apply(self, conv: Conversation, b: Batch, record_as: Batch) -> Batch:
        by_wb: dict[str, list] = {}
        for op in b.ops:
            by_wb.setdefault(op.workbook_id, []).append(op)
        results: dict[str, tuple[bytes, Any]] = {}
        gate_summary: dict[str, Any] = {"status": "passed", "errors": [], "formulas": 0,
                                        "workbooks": {}}
        for wid, ops in by_wb.items():
            new_wb = any(op.op == "create_workbook" for op in ops)
            if new_wb:
                base = to_xlsx_bytes(new_workbook(wid, wid, [_PLACEHOLDER]))
            else:
                try:
                    base = self.blobs.get(conv.workbook_ref(wid).current_sha)
                except KeyError as exc:
                    raise WorkbenchError(f"unknown workbook {wid}") from exc
            ops = [op for op in ops if op.op != "create_workbook"]
            try:
                candidate, gate = gate_and_apply(base, ops, self.gate)
            except ApplyConflict as exc:
                record_as.status = "blocked"
                record_as.gate = {"status": "conflict", "errors": exc.conflicts}
                return record_as
            if new_wb:
                candidate = _drop_placeholder_sheet(candidate)
            results[wid] = (candidate, gate)
            g = gate.to_dict()
            gate_summary["workbooks"][wid] = g
            gate_summary["formulas"] += g["formulas"]
            gate_summary["errors"].extend(g["errors"])
            if g["status"] == "blocked":
                gate_summary["status"] = "blocked"
            elif g["status"] == "unverified" and gate_summary["status"] == "passed":
                gate_summary["status"] = "unverified"
        record_as.gate = gate_summary
        if gate_summary["status"] == "blocked":
            record_as.status = "blocked"
            return record_as
        for wid, (candidate, gate) in results.items():
            sha = self.blobs.put(candidate)
            try:
                ref = conv.workbook_ref(wid)
            except KeyError:
                name = next((str(op.new_value) for op in b.ops
                             if op.op == "create_workbook" and op.workbook_id == wid), wid)
                ref = WorkbookRef(id=wid, name=name, origin="new")
                conv.workbooks.append(ref)
            ref.versions.append({"n": len(ref.versions) + 1, "sha": sha, "at": _now(),
                                 "batch_id": b.id, "gate": gate.to_dict()})
        record_as.status, record_as.decided_at = "accepted", _now()
        return record_as

    def version_sha(self, conv: Conversation, wb_id: str, version: int) -> str:
        for v in conv.workbook_ref(wb_id).versions:
            if v["n"] == version:
                return v["sha"]
        raise WorkbenchError(f"no version {version}")

    def version_model(self, conv: Conversation, wb_id: str, version: int) -> Workbook:
        """One saved version as a model, for a read-only preview."""
        ref = conv.workbook_ref(wb_id)
        m = load_xlsx(self.blobs.get(self.version_sha(conv, wb_id, version)), wb_id=ref.id,
                      name=ref.name, document_id=ref.document_id)
        m.origin = ref.origin
        return m

    def restore(self, conv: Conversation, wb_id: str, version: int, author: str) -> Batch:
        """Bring back an earlier version as a NEW version: the differences are written as
        ordinary cell changes, so the restore is in the history and can be undone.
        Sheets added after that version stay, with their cells cleared (a sheet delete
        could not be undone)."""
        from litchai.workbench.model import a1
        from litchai.workbench.ops import OpBuilder, new_batch

        ref = conv.workbook_ref(wb_id)
        if version == ref.versions[-1]["n"]:
            raise WorkbenchError("that is already the current version")
        target = self.version_model(conv, wb_id, version)
        current = self.models(conv, with_pending=False)[wb_id]
        ob = OpBuilder(current, "restore")
        reason = f"Restored version {version} by {author}"
        for name, sheet in target.sheets.items():
            if name not in current.sheets:
                ob.create_sheet(name, reason)
            cur = current.sheets.get(name)
            for (r, c), cell in sheet.cells.items():
                old = cur.get(r, c) if cur else None
                if old is not None and old.formula == cell.formula and (
                        cell.formula or old.value == cell.value) \
                        and (old.number_format or "General") == (cell.number_format or "General"):
                    continue
                if cell.formula is None and cell.value is None and old is None:
                    continue
                ob.set(name, a1(r, c), value=None if cell.formula else cell.value,
                       formula=cell.formula, number_format=cell.number_format, reason=reason)
        for name, cur in current.sheets.items():
            keep = target.sheets.get(name)
            for (r, c), old in cur.cells.items():
                if (keep is None or keep.get(r, c) is None) and (
                        old.value is not None or old.formula):
                    ob.set(name, a1(r, c), value=None, reason=reason)
        if not ob.ops:
            raise WorkbenchError(f"version {version} has the same cells as the current one")
        n = sum(1 for op in ob.ops if op.op == "set_cell")
        batch = new_batch(f"Restored version {version} by {author}",
                          f"{n} cell{'s' if n != 1 else ''}", "restore", ob.ops)
        self.add_batch(conv, batch)
        return self.accept(conv, batch.id)

    def download(self, conv: Conversation, wb_id: str, version: int | None = None) -> bytes:
        ref = conv.workbook_ref(wb_id)
        if version is None:
            return self.blobs.get(ref.current_sha)
        for v in ref.versions:
            if v["n"] == version:
                return self.blobs.get(v["sha"])
        raise WorkbenchError(f"no version {version}")


def _supersede(conv: Conversation, batch: Batch) -> None:
    """A new proposal that makes the same sheet as an older one still waiting
    replaces it: the older one is set aside (rejected, with the reason), so asking
    twice never gives "Balance Sheet 2"."""
    made = {(op.workbook_id, op.sheet) for op in batch.ops
            if op.op == "create_sheet" and op.sheet}
    if not made:
        return
    for older in conv.batches:
        if older.status != "pending":
            continue
        if any(o.op == "create_sheet" and (o.workbook_id, o.sheet) in made for o in older.ops):
            older.status, older.decided_at = "rejected", _now()
            older.summary = f"{older.summary} · replaced by a newer proposal".strip(" ·")


def _drop_placeholder_sheet(xlsx: bytes) -> bytes:
    import io

    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(xlsx))
    if _PLACEHOLDER in wb.sheetnames and len(wb.sheetnames) > 1:
        del wb[_PLACEHOLDER]
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()

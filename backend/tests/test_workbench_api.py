"""Workbench HTTP contract + the review-pack cache for /ask (3.8).
Offline: in-memory repo, scripted provider chain, injected recompute gate."""
from __future__ import annotations

import hashlib
import io
import json
from contextlib import contextmanager
from datetime import date

from fastapi.testclient import TestClient
from openpyxl import load_workbook
from procrastinate import testing
from workbench_fixtures import GOLDEN, ledger_bank_xlsx

from litchai.ai.provider import ProviderResponse
from litchai.ai.router import ProviderError, ProviderRouter, ProviderSpec
from litchai.api import create_app
from litchai.categorize.memory_store import InMemoryStore
from litchai.db import InMemoryRepository
from litchai.db.repo import LineItem
from litchai.queue import queue
from litchai.review.pack_cache import ReviewPackCache, engagement_fingerprint
from litchai.storage import Storage
from litchai.workbench.ops import GateResult

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class Scripted:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def __call__(self, spec, messages, schema, params):
        self.calls.append((spec.name, messages))
        if not self.replies:
            raise ProviderError("error", "script exhausted")
        item = self.replies.pop(0)
        return ProviderResponse(text=json.dumps(item), input_tokens=50, output_tokens=10)


def _setup(tmp_path, replies=()):
    repo = InMemoryRepository()
    storage = Storage(root=tmp_path)
    data = ledger_bank_xlsx()
    sha = hashlib.sha256(data).hexdigest()
    storage.store("c1", sha, data)  # the test decryptor is identity
    doc = repo.create_document("c1", "ledger.xlsx", XLSX, sha, len(data))
    transport = Scripted(replies)
    router = ProviderRouter([ProviderSpec("groq", "cloud", "m", "https://g", api_key="k")],
                            transport=transport)

    @contextmanager
    def repo_provider():
        yield repo

    @contextmanager
    def store_provider():
        yield InMemoryStore()

    app = create_app(repo_provider=repo_provider, store_provider=store_provider,
                     storage=storage, router_factory=lambda: router,
                     decryptor=lambda b: b, workbench_gate=lambda x: GateResult("passed", formulas=1),
                     categoriser_factory=lambda repo, cid: None)
    return app, repo, doc, transport


def _client(app):
    return TestClient(app)


def test_conversation_lifecycle(tmp_path):
    app, _, doc, transport = _setup(tmp_path, [
        {"plan": ["reconcile"], "action": "tool", "tool": "reconcile", "args": {}},
        {"action": "final", "answer": "Reconciled; difference ₦0.", "citations": ["Recon!C22"]},
    ])
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        assert c.post("/workbench/conversations", json={}).status_code == 422
        assert c.post("/workbench/conversations", json={
            "document_ids": [doc.id], "ai_mode": "nope"}).status_code == 422
        r = c.post("/workbench/conversations", json={
            "client_id": "c1", "document_ids": [doc.id], "client_name": "Okonkwo Agro"})
        assert r.status_code == 201
        body = r.json()
        cid = body["conversation"]["id"]
        assert "Reconcile bank to ledger" in body["first_look"]["suggestions"]

        # SSE turn stream
        with c.stream("POST", f"/workbench/conversations/{cid}/messages",
                      json={"message": "reconcile bank to ledger"}) as s:
            assert s.headers["content-type"].startswith("text/event-stream")
            raw = "".join(s.iter_text())
        frames = [json.loads(line[6:]) for line in raw.splitlines() if line.startswith("data: ")]
        types = [f["type"] for f in frames]
        assert types[0] == "start" and types[-1] == "final"
        result = next(f for f in frames if f["type"] == "tool_result")
        assert result["data"]["difference"] == 0
        batch_id = result["proposal"]["id"]
        assert result["proposal"]["risk"] == "safe"
        assert frames[-1]["citations"][0] == "Recon!C22"

        # the grid sees the pending proposal; the file does not
        cells = c.get(f"/workbench/conversations/{cid}/workbooks/doc-{doc.id}/sheets/Recon").json()
        assert any(x["pending"] and x["pending"]["batch_id"] == batch_id for x in cells["cells"])
        dl = c.get(f"/workbench/conversations/{cid}/workbooks/doc-{doc.id}.xlsx")
        assert "Recon" not in load_workbook(io.BytesIO(dl.content)).sheetnames

        # accept → new version; undo → back
        acc = c.post(f"/workbench/conversations/{cid}/batches/{batch_id}/accept").json()
        assert acc["batch"]["status"] == "accepted"
        dl = c.get(f"/workbench/conversations/{cid}/workbooks/doc-{doc.id}.xlsx")
        assert "Recon" in load_workbook(io.BytesIO(dl.content)).sheetnames
        assert c.post(f"/workbench/conversations/{cid}/batches/{batch_id}/reject"
                      ).status_code == 409
        und = c.post(f"/workbench/conversations/{cid}/batches/{batch_id}/undo").json()
        assert und["batch"]["status"] == "accepted"
        v1 = c.get(f"/workbench/conversations/{cid}/workbooks/doc-{doc.id}.xlsx",
                   params={"version": 1})
        assert load_workbook(io.BytesIO(v1.content)).sheetnames == ["Ledger", "Bank", "Notes"]
        assert c.post(f"/workbench/conversations/{cid}/batches/nope/accept").status_code == 404

        # direct tool (no model), chart preview, thread state
        t = c.post(f"/workbench/conversations/{cid}/tools/flag_anomalies", json={"args": {}})
        assert t.status_code == 200 and t.json()["data"]["by_kind"]["text_date"] == 1
        assert c.post(f"/workbench/conversations/{cid}/tools/rm_rf",
                      json={"args": {}}).status_code == 422
        pv = c.post(f"/workbench/conversations/{cid}/charts/preview", json={"spec": {
            "type": "column", "title": "Bank", "categories": "Bank!A2:A12",
            "series": [{"name": "Out", "ref": "Bank!C2:C12"}]}})
        assert pv.status_code == 200 and len(pv.json()["rows"]) == 11
        conv = c.get(f"/workbench/conversations/{cid}").json()["conversation"]
        assert conv["messages"][-1]["role"] == "assistant" and conv["provider"] == "groq"
        assert "mask_state" not in conv
        listed = c.get("/workbench/conversations", params={"client_id": "c1"}).json()
        assert [x["id"] for x in listed["conversations"]] == [cid]
        assert c.patch(f"/workbench/conversations/{cid}",
                       json={"ai_mode": "local_only"}).json()["conversation"]["ai_mode"] \
            == "local_only"
        assert c.get("/workbench/conversations/wb-missing").status_code == 404
    # nothing identifying left the VM
    for _, msgs in transport.calls:
        assert all("Okonkwo Agro" not in m["content"] for m in msgs)


def test_non_stream_turn_and_degraded_mode(tmp_path):
    app, _, doc, _ = _setup(tmp_path, [])  # script empty → every provider fails
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        r = c.post(f"/workbench/conversations/{cid}/messages", params={"stream": "false"},
                   json={"message": "build the p&l"})
        final = r.json()["final"]
        assert final["type"] == "final" and final["degraded"] is True
        assert c.post(f"/workbench/conversations/{cid}/messages",
                      json={"message": ""}).status_code == 422


def test_document_profile_and_providers(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        prof = c.get(f"/documents/{doc.id}/profile").json()
        assert prof["sheet_names"] == ["Ledger", "Bank", "Notes"]
        assert c.get(f"/documents/{doc.id}/profile", params={"level": 9}).status_code == 422
        assert c.get("/documents/9999/profile").status_code == 404
        prov = c.get("/ai/providers").json()
        assert prov["chain"][0]["name"] == "groq"
        assert "api_key" not in json.dumps(prov)


def test_pdf_documents_open_from_line_items(tmp_path):
    app, repo, _, _ = _setup(tmp_path)
    pdf = repo.create_document("c1", "statement.pdf", "application/pdf", "ab" * 32, 10)
    repo.add_line_items([
        LineItem(id=0, document_id=pdf.id, raw_text="SALES", normalized_text="sales",
                 direction="credit", amount=GOLDEN["revenue"], page_ref=1,
                 txn_date=date(2025, 1, 5)),
    ])
    empty = repo.create_document("c1", "scan.pdf", "application/pdf", "cd" * 32, 10)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        r = c.post("/workbench/conversations", json={"document_ids": [pdf.id]})
        assert r.status_code == 201
        assert c.post("/workbench/conversations",
                      json={"document_ids": [empty.id]}).status_code == 409
        other = repo.create_document("c2", "x.pdf", "application/pdf", "ef" * 32, 10)
        assert c.post("/workbench/conversations", json={
            "client_id": "c1", "document_ids": [other.id]}).status_code == 409


def test_review_pack_cache_follows_engagement_version():
    repo = InMemoryRepository()
    eng = repo.create_engagement("c1", "FY2025", "pnl")
    doc = repo.create_document("c1", "l.pdf", "application/pdf", "aa" * 32, 1,
                               engagement_id=eng.id)
    [li] = repo.add_line_items([LineItem(id=0, document_id=doc.id, raw_text="x",
                                         normalized_text="x", direction="credit",
                                         amount=10.0)])
    fp1 = engagement_fingerprint(repo, eng.id)
    cache = ReviewPackCache()
    cache.put(eng.id, fp1, "pack-1")
    assert cache.get(eng.id, fp1) == "pack-1"
    repo.set_line_item_category(li.id, category_code="REV.SALES", category_source="human",
                                confidence=1.0, taxonomy_version="t", needs_review=False)
    fp2 = engagement_fingerprint(repo, eng.id)
    assert fp2 != fp1 and cache.get(eng.id, fp2) is None
    cache.put(eng.id, fp2, "pack-2")
    assert cache.get(eng.id, fp1) is None  # one live version per engagement
    assert engagement_fingerprint(repo, 9999) is None


def test_verified_download_goes_through_the_gate(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        url = f"/workbench/conversations/{cid}/workbooks/doc-{doc.id}/verified.xlsx"
        ok = c.get(url)
        assert ok.status_code == 200 and ok.headers["x-gate-status"] == "passed"
        assert load_workbook(io.BytesIO(ok.content)).sheetnames == ["Ledger", "Bank", "Notes"]
        app.state.workbench_gate = lambda x: GateResult("blocked", errors=["P&L!C9: #REF!"])
        blocked = c.get(url)
        assert blocked.status_code == 409
        assert blocked.json()["detail"]["gate"]["errors"] == ["P&L!C9: #REF!"]
        assert c.get(f"/workbench/conversations/{cid}/workbooks/nope/verified.xlsx"
                     ).status_code == 404

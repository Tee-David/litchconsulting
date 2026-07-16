"""Document upload/status API tests (Phase 2a).

In-memory repo + tmp storage + procrastinate's InMemoryConnector — the real
Postgres/worker round-trip is verified on the VM (checklist gate).
"""
from contextlib import contextmanager

from fastapi.testclient import TestClient
from procrastinate import testing

from litchai.api import create_app
from litchai.categorize.memory_store import InMemoryStore
from litchai.db import InMemoryRepository
from litchai.queue import queue
from litchai.storage import Storage

CLIENT = "11111111-1111-1111-1111-111111111111"


def _harness(tmp_path):
    repo = InMemoryRepository()
    store = InMemoryStore()

    @contextmanager
    def repo_provider():
        yield repo

    @contextmanager
    def store_provider():
        yield store

    app = create_app(
        repo_provider=repo_provider, storage=Storage(root=tmp_path), store_provider=store_provider
    )
    app.state.test_repo = repo
    app.state.test_store = store
    return repo, testing.InMemoryConnector(), app


def _upload(client, *, mime="application/pdf", body=b"CIPHERTEXT-ENVELOPE"):
    return client.post(
        "/documents",
        params={"client_id": CLIENT, "filename": "gtbank-jan.pdf", "mime": mime},
        content=body,
        headers={"content-type": "application/octet-stream"},
    )


def test_upload_creates_document_and_enqueues_ingest(tmp_path):
    repo, conn, app = _harness(tmp_path)
    with queue.replace_connector(conn), TestClient(app) as client:
        resp = _upload(client)
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "received"
        assert body["duplicate"] is False
        assert any(j["task_name"] == "litchai.ingest_document" for j in conn.jobs.values())

        got = client.get(f"/documents/{body['document_id']}").json()
        assert got["status"] == "received"
        assert got["progress"] == {}


def test_identical_ciphertext_is_a_duplicate_and_not_re_enqueued(tmp_path):
    repo, conn, app = _harness(tmp_path)
    with queue.replace_connector(conn), TestClient(app) as client:
        first = _upload(client).json()
        second = _upload(client).json()
        assert second["duplicate"] is True
        assert second["document_id"] == first["document_id"]
        ingest_jobs = [j for j in conn.jobs.values() if j["task_name"] == "litchai.ingest_document"]
        assert len(ingest_jobs) == 1


def test_unsupported_mime_rejected(tmp_path):
    repo, conn, app = _harness(tmp_path)
    with queue.replace_connector(conn), TestClient(app) as client:
        assert _upload(client, mime="application/x-msdownload").status_code == 415


def test_empty_upload_rejected(tmp_path):
    repo, conn, app = _harness(tmp_path)
    with queue.replace_connector(conn), TestClient(app) as client:
        assert _upload(client, body=b"").status_code == 400


def test_ciphertext_written_to_storage_not_plaintext(tmp_path):
    repo, conn, app = _harness(tmp_path)
    with queue.replace_connector(conn), TestClient(app) as client:
        body = _upload(client, body=b"ENVELOPE-BYTES").json()
    # the stored file is exactly the posted ciphertext (no decryption on the API side)
    doc = repo.get_document(body["document_id"])
    stored = Storage(root=tmp_path).read(CLIENT, doc.source_hash)
    assert stored == b"ENVELOPE-BYTES"


def test_missing_document_404(tmp_path):
    repo, conn, app = _harness(tmp_path)
    with queue.replace_connector(conn), TestClient(app) as client:
        assert client.get("/documents/999").status_code == 404


def _seed_reviewable(repo):
    """A document with two categorized line items (one flagged) for review tests."""
    from litchai.db import LineItem
    doc = repo.create_document(CLIENT, "s.xlsx", "application/pdf", "rev-hash", 100)
    repo.add_line_items([
        LineItem(id=0, document_id=doc.id, raw_text="POS PAYSTACK", normalized_text="paystack",
                 direction="in", amount=500000.0, category_code="revenue.goods",
                 category_source="llm", confidence=0.5, needs_review=True),
        LineItem(id=0, document_id=doc.id, raw_text="COT CHARGE", normalized_text="cot charge",
                 direction="out", amount=50.0, category_code="bank.charges",
                 category_source="exact", confidence=1.0, needs_review=False),
    ])
    return doc


def test_list_documents(tmp_path):
    repo, conn, app = _harness(tmp_path)
    _seed_reviewable(repo)
    with queue.replace_connector(conn), TestClient(app) as client:
        body = client.get("/documents", params={"client_id": CLIENT}).json()
        assert len(body["documents"]) == 1
        assert body["documents"][0]["filename"] == "s.xlsx"


def test_review_endpoint_returns_queue_and_lineage(tmp_path):
    repo, conn, app = _harness(tmp_path)
    doc = _seed_reviewable(repo)
    with queue.replace_connector(conn), TestClient(app) as client:
        body = client.get(f"/documents/{doc.id}/review").json()
        assert len(body["line_items"]) == 2
        # risk order puts the big, uncertain, LLM-sourced line first
        assert body["queue"][0]["risk"] >= body["queue"][1]["risk"]
        top_id = body["queue"][0]["line_item_id"]
        assert next(li for li in body["line_items"] if li["id"] == top_id)["category_source"] == "llm"
        assert any(fig["figure"] == "revenue.goods" for fig in body["lineage"])


def test_recategorize_dual_writes_and_learns(tmp_path):
    repo, conn, app = _harness(tmp_path)
    doc = _seed_reviewable(repo)
    lid = repo.get_line_items(doc.id)[0].id  # the paystack line
    with queue.replace_connector(conn), TestClient(app) as client:
        resp = client.post(f"/documents/{doc.id}/lines/{lid}/recategorize",
                           params={"new_code": "revenue.services"})
        assert resp.status_code == 200
    # line updated + memory learned
    assert repo.get_line_items(doc.id)[0].category_code == "revenue.services"
    assert repo.get_line_items(doc.id)[0].category_source == "human"
    assert app.state.test_store.exact("paystack", CLIENT)  # dual-written to retrieval store


def test_recategorize_rejects_bad_code(tmp_path):
    repo, conn, app = _harness(tmp_path)
    doc = _seed_reviewable(repo)
    lid = repo.get_line_items(doc.id)[0].id
    with queue.replace_connector(conn), TestClient(app) as client:
        resp = client.post(f"/documents/{doc.id}/lines/{lid}/recategorize",
                           params={"new_code": "revenue"})  # structural node, not postable
        assert resp.status_code == 400

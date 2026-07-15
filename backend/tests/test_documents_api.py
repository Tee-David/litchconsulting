"""Document upload/status API tests (Phase 2a).

In-memory repo + tmp storage + procrastinate's InMemoryConnector — the real
Postgres/worker round-trip is verified on the VM (checklist gate).
"""
from contextlib import contextmanager

from fastapi.testclient import TestClient
from procrastinate import testing

from litchai.api import create_app
from litchai.db import InMemoryRepository
from litchai.queue import queue
from litchai.storage import Storage

CLIENT = "11111111-1111-1111-1111-111111111111"


def _harness(tmp_path):
    repo = InMemoryRepository()

    @contextmanager
    def provider():
        yield repo

    app = create_app(repo_provider=provider, storage=Storage(root=tmp_path))
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

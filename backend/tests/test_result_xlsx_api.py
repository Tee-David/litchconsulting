"""`GET /documents/{id}/result.xlsx` — compile → retrievable deliverable.

Compiles are keyed by engagement, so the endpoint resolves document →
engagement → latest generated file, then reads the workbook back out of the
artifact store by the sha256 recorded at compile time. In-memory repo + tmp
storage; the real Postgres/LibreOffice round-trip is verified on the VM.
"""
from contextlib import contextmanager

from fastapi.testclient import TestClient

from litchai.api import create_app
from litchai.categorize.memory_store import InMemoryStore
from litchai.db import InMemoryRepository
from litchai.storage import Storage

CLIENT = "11111111-1111-1111-1111-111111111111"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _harness(tmp_path):
    repo = InMemoryRepository()
    store = InMemoryStore()

    @contextmanager
    def repo_provider():
        yield repo

    @contextmanager
    def store_provider():
        yield store

    storage = Storage(root=tmp_path)
    app = create_app(
        repo_provider=repo_provider, storage=storage, store_provider=store_provider
    )
    return repo, storage, TestClient(app)


def _document(repo, *, engagement_id):
    return repo.create_document(
        client_id=CLIENT,
        engagement_id=engagement_id,
        filename="gtbank-jan.pdf",
        mime="application/pdf",
        source_hash="a" * 64,
        byte_size=10,
    )


def _engagement(repo):
    return repo.create_engagement(CLIENT, "FY2025", "annual_report_ifrs18")


def test_returns_the_compiled_workbook(tmp_path):
    repo, storage, client = _harness(tmp_path)
    eng = _engagement(repo)
    doc = _document(repo, engagement_id=eng.id)

    blob = b"PK\x03\x04-fake-xlsx-bytes"
    sha = "f" * 64
    storage.store_artifact(sha, blob)
    repo.record_generated_file(eng.id, eng.template, "1.0.0", "passed", sha256=sha)

    res = client.get(f"/documents/{doc.id}/result.xlsx")

    assert res.status_code == 200
    assert res.content == blob
    assert res.headers["content-type"] == XLSX_MIME
    assert f"engagement_{eng.id}_{eng.template}.xlsx" in res.headers["content-disposition"]


def test_serves_the_latest_compile_when_recompiled(tmp_path):
    repo, storage, client = _harness(tmp_path)
    eng = _engagement(repo)
    doc = _document(repo, engagement_id=eng.id)

    storage.store_artifact("1" * 64, b"first-compile")
    repo.record_generated_file(eng.id, eng.template, "1.0.0", "passed", sha256="1" * 64)
    storage.store_artifact("2" * 64, b"second-compile")
    repo.record_generated_file(eng.id, eng.template, "1.0.1", "passed", sha256="2" * 64)

    res = client.get(f"/documents/{doc.id}/result.xlsx")

    assert res.status_code == 200
    assert res.content == b"second-compile"


def test_404_for_unknown_document(tmp_path):
    _, _, client = _harness(tmp_path)
    assert client.get("/documents/9999/result.xlsx").status_code == 404


def test_404_when_document_has_no_engagement(tmp_path):
    repo, _, client = _harness(tmp_path)
    doc = _document(repo, engagement_id=None)
    res = client.get(f"/documents/{doc.id}/result.xlsx")
    assert res.status_code == 404
    assert "engagement" in res.json()["detail"]


def test_409_when_engagement_not_compiled_yet(tmp_path):
    repo, _, client = _harness(tmp_path)
    eng = _engagement(repo)
    doc = _document(repo, engagement_id=eng.id)

    res = client.get(f"/documents/{doc.id}/result.xlsx")

    assert res.status_code == 409
    assert "compiled" in res.json()["detail"]


def test_410_when_metadata_outlives_the_blob(tmp_path):
    repo, _, client = _harness(tmp_path)
    eng = _engagement(repo)
    doc = _document(repo, engagement_id=eng.id)
    # Recorded, but the artifact was never written (pre-artifact compile).
    repo.record_generated_file(eng.id, eng.template, "1.0.0", "passed", sha256="d" * 64)

    res = client.get(f"/documents/{doc.id}/result.xlsx")

    assert res.status_code == 410
    assert "recompile" in res.json()["detail"]


def test_artifacts_are_content_addressed_and_isolated_from_ciphertext(tmp_path):
    _, storage, _ = _harness(tmp_path)
    sha = "c" * 64
    storage.store_artifact(sha, b"deliverable")

    assert storage.artifact_exists(sha)
    assert storage.read_artifact(sha) == b"deliverable"
    # Our output must not land in the client's ciphertext tree.
    assert "artifacts" in str(storage.artifact_path_for(sha))
    assert not storage.exists(CLIENT, sha)

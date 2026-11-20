"""Workbench v7: remove a file, purge a workbench, search names, files and chats."""
from __future__ import annotations

import hashlib
from contextlib import contextmanager

from fastapi.testclient import TestClient
from procrastinate import testing

from litchai.api import create_app
from litchai.categorize.memory_store import InMemoryStore
from litchai.db import InMemoryRepository
from litchai.queue import queue
from litchai.storage import Storage
from litchai.workbench.ops import GateResult


def _app(tmp_path):
    repo, storage = InMemoryRepository(), Storage(root=tmp_path)
    docs = {}
    for name, data in {"bank.csv": b"Date,Narration,Amount\n2026-01-05,POS,1500\n",
                       "sales.csv": b"Date,Item,Amount\n2026-01-06,Rice,9000\n"}.items():
        sha = hashlib.sha256(data).hexdigest()
        storage.store("c1", sha, data)
        docs[name] = repo.create_document("c1", name, "text/csv", sha, len(data))

    @contextmanager
    def repo_provider():
        yield repo

    @contextmanager
    def store_provider():
        yield InMemoryStore()

    app = create_app(repo_provider=repo_provider, store_provider=store_provider, storage=storage,
                     decryptor=lambda b: b, workbench_gate=lambda x: GateResult("passed"),
                     categoriser_factory=lambda repo, cid: None)
    return app, repo, storage, docs


def test_remove_a_file_purge_and_search(tmp_path):
    app, repo, storage, docs = _app(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), TestClient(app) as c:
        r = c.post("/workbench/conversations", json={
            "client_id": "c1", "title": "Ebube year end",
            "document_ids": [docs["bank.csv"].id, docs["sales.csv"].id]})
        assert r.status_code == 201
        conv = r.json()["conversation"]
        cid, (bank, sales) = conv["id"], conv["workbooks"]

        # search: by the workbench name and by a file name
        hits = c.get("/workbench/search", params={"q": "ebube"}).json()["results"]
        assert [h["id"] for h in hits] == [cid] and hits[0]["where"] == "name"
        hits = c.get("/workbench/search", params={"q": "sales.csv"}).json()["results"]
        assert hits and hits[0]["where"] == "file"
        assert c.get("/workbench/search", params={"q": "nothing like this"}).json()["results"] == []

        # remove one file and delete its upload
        r = c.post(f"/workbench/conversations/{cid}/workbooks/{sales['id']}/remove",
                   json={"delete_document": True})
        assert r.status_code == 200 and r.json()["document_deleted"] is True
        assert [w["id"] for w in r.json()["conversation"]["workbooks"]] == [bank["id"]]
        assert repo.get_document(docs["sales.csv"].id) is None
        assert repo.get_document(docs["bank.csv"].id) is not None
        assert c.post(f"/workbench/conversations/{cid}/workbooks/{sales['id']}/remove",
                      json={}).status_code == 404

        # purge the workbench: the conversation and the listed upload go
        r = c.delete(f"/workbench/conversations/{cid}",
                     params={"delete_documents": str(docs["bank.csv"].id)})
        assert r.json()["purged"] is True and r.json()["documents_deleted"] == 1
        assert c.get(f"/workbench/conversations/{cid}").status_code == 404
        assert repo.get_document(docs["bank.csv"].id) is None
        assert c.delete(f"/workbench/conversations/{cid}").json()["purged"] is False


def test_an_upload_used_by_another_workbench_is_kept(tmp_path):
    app, repo, storage, docs = _app(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), TestClient(app) as c:
        ids = [docs["bank.csv"].id]
        a = c.post("/workbench/conversations", json={"client_id": "c1", "document_ids": ids})
        b = c.post("/workbench/conversations", json={"client_id": "c1", "document_ids": ids})
        a_id, b_id = a.json()["conversation"]["id"], b.json()["conversation"]["id"]
        wb_a = a.json()["conversation"]["workbooks"][0]["id"]
        r = c.post(f"/workbench/conversations/{a_id}/workbooks/{wb_a}/remove",
                   json={"delete_document": True})
        assert r.json()["document_deleted"] is False  # workbench B still uses it
        r = c.delete(f"/workbench/conversations/{a_id}", params={"delete_documents": str(ids[0])})
        assert r.json()["documents_deleted"] == 0
        assert repo.get_document(ids[0]) is not None
        assert c.get(f"/workbench/conversations/{b_id}").status_code == 200

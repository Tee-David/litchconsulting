"""F1: building the same sheet again never makes "Recon 2" or "Balance Sheet 5"."""
from __future__ import annotations

import io

from openpyxl import load_workbook
from procrastinate import testing
from test_workbench_api import _client, _setup

from litchai.queue import queue


def _sheets(c, cid, doc_id):
    dl = c.get(f"/workbench/conversations/{cid}/workbooks/doc-{doc_id}.xlsx")
    return load_workbook(io.BytesIO(dl.content)).sheetnames


def _recon(c, cid):
    r = c.post(f"/workbench/conversations/{cid}/tools/reconcile", json={"args": {}})
    assert r.status_code == 200, r.text
    return r.json()["batch"]


def test_same_sheet_is_rebuilt_not_copied(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        before = _sheets(c, cid, doc.id)

        # Asked twice before accepting: the first proposal is replaced, the name stays.
        first = _recon(c, cid)
        second = _recon(c, cid)
        batches = {b["id"]: b for b in c.get(f"/workbench/conversations/{cid}/batches").json()["batches"]}
        assert batches[first["id"]]["status"] == "rejected"
        assert "replaced by a newer proposal" in batches[first["id"]]["summary"]
        created = [o["sheet"] for o in second["ops"] if o["op"] == "create_sheet"]
        assert created == ["Recon"]
        acc = c.post(f"/workbench/conversations/{cid}/batches/{second['id']}/accept")
        assert acc.status_code == 200 and acc.json()["batch"]["status"] == "accepted"

        # Asked again after accepting: the same sheet is rebuilt in place.
        third = _recon(c, cid)
        assert not [o for o in third["ops"] if o["op"] == "create_sheet"]
        assert {o["sheet"] for o in third["ops"]} == {"Recon"}
        assert c.post(f"/workbench/conversations/{cid}/batches/{third['id']}/accept"
                      ).json()["batch"]["status"] == "accepted"
        assert _sheets(c, cid, doc.id) == [*before, "Recon"]

        # An explicit "new sheet" with a taken name still makes a new sheet.
        r = c.post(f"/workbench/conversations/{cid}/tools/create_sheet", json={"args": {"name": "Recon"}})
        assert r.status_code == 200, r.text
        assert [o["sheet"] for o in r.json()["batch"]["ops"] if o["op"] == "create_sheet"] == ["Recon 2"]

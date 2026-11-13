"""R4: version history. Preview a saved version read-only; restore it as a new, undoable version."""
from __future__ import annotations

import io

from openpyxl import load_workbook
from procrastinate import testing
from test_workbench_api import _client, _setup

from litchai.queue import queue


def _ledger(c, cid, doc_id):
    dl = c.get(f"/workbench/conversations/{cid}/workbooks/doc-{doc_id}.xlsx")
    return load_workbook(io.BytesIO(dl.content))["Ledger"]


def test_preview_and_restore_a_version(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={
            "client_id": "c1", "document_ids": [doc.id], "client_name": "Okonkwo Agro"}).json()["conversation"]["id"]
        wb_id = f"doc-{doc.id}"
        base = f"/workbench/conversations/{cid}/workbooks/{wb_id}"
        original_a1 = _ledger(c, cid, doc.id)["A1"].value

        # Version 2: two typed cells. Version 3: one changed, one cleared, one more added.
        assert c.post(f"/workbench/conversations/{cid}/edits", json={"workbook_id": wb_id, "edits": [
            {"sheet": "Ledger", "cell": "H1", "value": "first"},
            {"sheet": "Ledger", "cell": "H2", "value": 10}]}).status_code == 200
        assert c.post(f"/workbench/conversations/{cid}/edits", json={"workbook_id": wb_id, "edits": [
            {"sheet": "Ledger", "cell": "H1", "value": "second"},
            {"sheet": "Ledger", "cell": "H2", "clear": True},
            {"sheet": "Ledger", "cell": "A1", "value": "changed"},
            {"sheet": "Ledger", "cell": "H3", "formula": "=1+1"}]}).status_code == 200

        # Preview version 2: read-only cells of that version.
        prev = c.get(f"{base}/sheets/Ledger", params={"version": 2, "r0": 1, "r1": 5, "c0": 1, "c1": 8})
        assert prev.status_code == 200
        cells = {x["ref"]: x for x in prev.json()["cells"]}
        assert cells["H1"]["v"] == "first" and cells["H2"]["v"] == 10 and "H3" not in cells
        assert c.get(f"{base}/sheets/Ledger", params={"version": 99}).status_code == 404

        # Restore version 2: a new version 4 with version 2's cells.
        r = c.post(f"{base}/restore", json={"version": 2, "author": "Tee-David"})
        assert r.status_code == 200, r.text
        batch = r.json()["batch"]
        assert batch["status"] == "accepted" and batch["title"] == "Restored version 2 by Tee-David"
        ref = next(w for w in r.json()["conversation"]["workbooks"] if w["id"] == wb_id)
        assert [v["n"] for v in ref["versions"]] == [1, 2, 3, 4]
        ws = _ledger(c, cid, doc.id)
        assert ws["H1"].value == "first" and ws["H2"].value == 10 and ws["H3"].value is None
        assert ws["A1"].value == original_a1

        # The restore is undoable like any change.
        und = c.post(f"/workbench/conversations/{cid}/batches/{batch['id']}/undo")
        assert und.status_code == 200, und.text
        ws = _ledger(c, cid, doc.id)
        assert ws["H1"].value == "second" and ws["H3"].value == "=1+1" and ws["A1"].value == "changed"

        # Refused: the current version, an unknown version, an unknown workbook.
        cur = len(und.json()["conversation"]["workbooks"][0]["versions"])
        assert c.post(f"{base}/restore", json={"version": cur}).status_code == 409
        assert c.post(f"{base}/restore", json={"version": 99}).status_code == 409
        assert c.post(f"/workbench/conversations/{cid}/workbooks/nope/restore",
                      json={"version": 1}).status_code == 404

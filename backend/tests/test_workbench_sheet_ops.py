"""S2: the sheet tab menu. Every action saves a version and undo reverses it."""
from __future__ import annotations

import io

from openpyxl import load_workbook
from procrastinate import testing
from test_workbench_api import _client, _setup

from litchai.queue import queue


def _book(c, cid, doc_id):
    dl = c.get(f"/workbench/conversations/{cid}/workbooks/doc-{doc_id}.xlsx")
    return load_workbook(io.BytesIO(dl.content))


def test_sheet_actions_and_undo(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        base = f"/workbench/conversations/{cid}/workbooks/doc-{doc.id}/sheets"

        def act(sheet, **body):
            return c.post(f"{base}/{sheet}/action", json={"author": "Tee-David", **body})

        def undo(r):
            u = c.post(f"/workbench/conversations/{cid}/batches/{r.json()['batch']['id']}/undo")
            assert u.status_code == 200 and u.json()["batch"]["status"] == "accepted", u.text

        # A formula on Bank that points at Ledger follows the rename.
        assert c.post(f"/workbench/conversations/{cid}/edits", json={"workbook_id": f"doc-{doc.id}",
            "edits": [{"sheet": "Bank", "cell": "H1", "formula": "=Ledger!A1"}]}).status_code == 200
        r = act("Ledger", action="rename", name="Main ledger")
        assert r.status_code == 200, r.text
        assert r.json()["batch"]["title"] == "Renamed Ledger to Main ledger by Tee-David"
        wb = _book(c, cid, doc.id)
        assert wb.sheetnames == ["Main ledger", "Bank", "Notes"]
        assert wb["Bank"]["H1"].value == "='Main ledger'!A1"
        undo(r)
        wb = _book(c, cid, doc.id)
        assert wb.sheetnames == ["Ledger", "Bank", "Notes"] and wb["Bank"]["H1"].value == "=Ledger!A1"

        # Move, duplicate, colour, hide: each undoable.
        r = act("Notes", action="move", index=0)
        assert _book(c, cid, doc.id).sheetnames == ["Notes", "Ledger", "Bank"]
        undo(r)
        assert _book(c, cid, doc.id).sheetnames == ["Ledger", "Bank", "Notes"]
        r = act("Bank", action="copy")
        assert _book(c, cid, doc.id).sheetnames == ["Ledger", "Bank", "Bank (copy)", "Notes"]
        undo(r)
        r = act("Bank", action="color", color="2540C4")
        assert _book(c, cid, doc.id)["Bank"].sheet_properties.tabColor.rgb.endswith("2540C4")
        info = c.get(f"{base}/Bank").json()["sheet_info"]
        assert {"name": "Bank", "color": "2540C4", "hidden": False} in info
        undo(r)
        r = act("Notes", action="hide")
        assert _book(c, cid, doc.id)["Notes"].sheet_state == "hidden"
        undo(r)
        assert _book(c, cid, doc.id)["Notes"].sheet_state == "visible"

        # Delete keeps a snapshot, so undo brings the sheet back in its place.
        before = _book(c, cid, doc.id)["Bank"]["A2"].value
        r = act("Bank", action="delete")
        assert r.status_code == 200, r.text
        assert _book(c, cid, doc.id).sheetnames == ["Ledger", "Notes"]
        undo(r)
        wb = _book(c, cid, doc.id)
        assert wb.sheetnames == ["Ledger", "Bank", "Notes"] and wb["Bank"]["A2"].value == before

        # Refused: a taken name, an empty name, an unknown sheet.
        assert act("Bank", action="rename", name="ledger").status_code == 409
        assert act("Bank", action="rename", name="  ").status_code == 422
        assert act("Nope", action="hide").status_code == 404

"""S3: insert and delete rows and columns; formulas follow; undo reverses."""
from __future__ import annotations

import io

import pytest
from openpyxl import load_workbook
from procrastinate import testing
from test_workbench_api import _client, _setup

from litchai.queue import queue
from litchai.workbench.structure import _Ref, shift_formula


def _sf(f, **kw):
    base = dict(own_sheet="S", target="S", rows=True, at=3, count=2, delete=False)
    base.update(kw)
    return shift_formula(f, **base)


def test_shift_formula_rows_and_cols():
    assert _sf("=A1+A3+$B$4") == "=A1+A5+$B$6"
    assert _sf("=SUM(B2:B10)") == "=SUM(B2:B12)"
    assert _sf("=SUM(B2:B10)", delete=True) == "=SUM(B2:B8)"
    assert _sf("=B10", delete=True) == "=B8"
    assert _sf("=Other!A5") == "=Other!A5"                      # another sheet: untouched
    assert _sf("=S!A5", own_sheet="Other") == "=S!A7"            # points at the target
    assert _sf("='My S'!A5", own_sheet="X", target="My S") == "='My S'!A7"
    assert _sf('="A5"&A5') == '="A5"&A7'                         # text is never touched
    assert _sf("=SUM(A:A)") == "=SUM(A:A)"                       # whole column: rows don't move it
    with pytest.raises(_Ref):
        _sf("=B3", delete=True)
    with pytest.raises(_Ref):
        _sf("=SUM(B3:B4)", delete=True)
    # Columns: insert 1 at C.
    assert _sf("=B1+C1+SUM(A1:D1)", rows=False, at=3, count=1) == "=B1+D1+SUM(A1:E1)"
    assert _sf("=SUM(C:C)", rows=False, at=3, count=1) == "=SUM(D:D)"


def test_insert_delete_rows_and_cols_via_api(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        wid = f"doc-{doc.id}"
        base = f"/workbench/conversations/{cid}/workbooks/{wid}/sheets"

        def book():
            dl = c.get(f"/workbench/conversations/{cid}/workbooks/{wid}.xlsx")
            return load_workbook(io.BytesIO(dl.content))

        def act(**body):
            return c.post(f"{base}/Bank/action", json={"author": "Tee-David", **body})

        def undo(r):
            u = c.post(f"/workbench/conversations/{cid}/batches/{r.json()['batch']['id']}/undo")
            assert u.status_code == 200 and u.json()["batch"]["status"] == "accepted", u.text

        edits = [{"sheet": "Bank", "cell": "J1", "value": 1}, {"sheet": "Bank", "cell": "J2", "value": 2},
                 {"sheet": "Bank", "cell": "J3", "value": 3},
                 {"sheet": "Bank", "cell": "K1", "formula": "=SUM(J1:J3)"},
                 {"sheet": "Notes", "cell": "A1", "formula": "=Bank!J3"}]
        assert c.post(f"/workbench/conversations/{cid}/edits",
                      json={"workbook_id": wid, "edits": edits}).status_code == 200

        r = act(action="insert_rows", at=2, count=2)
        assert r.status_code == 200, r.text
        assert r.json()["batch"]["title"] == "Inserted 2 rows at 2–3 on Bank by Tee-David"
        wb = book()
        assert wb["Bank"]["J5"].value == 3 and wb["Bank"]["K1"].value == "=SUM(J1:J5)"
        assert wb["Notes"]["A1"].value == "=Bank!J5"
        undo(r)
        wb = book()
        assert wb["Bank"]["J3"].value == 3 and wb["Bank"]["K1"].value == "=SUM(J1:J3)"

        # Deleting a row a formula points at is refused, with the cell named.
        r = act(action="delete_rows", at=3, count=1)
        assert r.status_code == 409 and "Notes!A1" in r.json()["detail"]
        # Row 2 only shrinks the SUM; undo brings the value back.
        r = act(action="delete_rows", at=2, count=1)
        assert r.status_code == 200, r.text
        wb = book()
        assert wb["Bank"]["K1"].value == "=SUM(J1:J2)" and wb["Notes"]["A1"].value == "=Bank!J2"
        undo(r)
        wb = book()
        assert wb["Bank"]["J2"].value == 2 and wb["Bank"]["K1"].value == "=SUM(J1:J3)"

        # Columns: insert one at J moves J into K and K into L.
        r = act(action="insert_cols", at=10, count=1)
        assert r.status_code == 200, r.text
        wb = book()
        assert wb["Bank"]["L1"].value == "=SUM(K1:K3)" and wb["Notes"]["A1"].value == "=Bank!K3"
        undo(r)
        assert book()["Bank"]["K1"].value == "=SUM(J1:J3)"
        assert act(action="insert_rows").status_code == 422

"""E2: a person's own edits are saved at once as a named, undoable version."""
from __future__ import annotations

import io

from openpyxl import load_workbook
from procrastinate import testing
from test_workbench_api import _client, _setup

from litchai.queue import queue
from litchai.workbench.formula import FormulaError, check_user_formula


def _ledger(c, cid, doc_id, version=None):
    params = {"version": version} if version else None
    dl = c.get(f"/workbench/conversations/{cid}/workbooks/doc-{doc_id}.xlsx", params=params)
    return load_workbook(io.BytesIO(dl.content))["Ledger"]


def test_user_edit_saves_a_named_version_and_undoes(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={
            "client_id": "c1", "document_ids": [doc.id], "client_name": "Okonkwo Agro"}).json()["conversation"]["id"]
        wb_id = f"doc-{doc.id}"
        r = c.post(f"/workbench/conversations/{cid}/edits", json={
            "workbook_id": wb_id, "author": "Tee-David",
            "edits": [
                {"sheet": "Ledger", "cell": "H1", "value": "Checked"},
                {"sheet": "Ledger", "cell": "H2", "value": 1250.5, "number_format": "#,##0.00"},
                {"sheet": "Ledger", "cell": "H3", "formula": "VLOOKUP(H2,H2:H2,1,FALSE)"},
            ],
        })
        assert r.status_code == 200, r.text
        batch = r.json()["batch"]
        assert batch["status"] == "accepted"
        assert batch["title"] == "Edited by Tee-David" and batch["tool"] == "user_edit"
        ws = _ledger(c, cid, doc.id)
        assert ws["H1"].value == "Checked" and ws["H2"].value == 1250.5
        assert ws["H2"].number_format == "#,##0.00"
        assert ws["H3"].value == "=VLOOKUP(H2,H2:H2,1,FALSE)"

        # Undo is the normal batch undo.
        und = c.post(f"/workbench/conversations/{cid}/batches/{batch['id']}/undo")
        assert und.status_code == 200
        assert _ledger(c, cid, doc.id)["H1"].value is None

        # Refused: unknown function, unknown sheet, bad cell, nothing to change.
        bad = c.post(f"/workbench/conversations/{cid}/edits", json={
            "workbook_id": wb_id, "edits": [{"sheet": "Ledger", "cell": "A1", "formula": "=WEBSERVICE(A2)"}]})
        assert bad.status_code == 422 and "WEBSERVICE" in bad.json()["detail"]
        assert c.post(f"/workbench/conversations/{cid}/edits", json={
            "workbook_id": wb_id, "edits": [{"sheet": "Nope", "cell": "A1", "value": 1}]}).status_code == 422
        assert c.post(f"/workbench/conversations/{cid}/edits", json={
            "workbook_id": wb_id, "edits": [{"sheet": "Ledger", "cell": "1A", "value": 1}]}).status_code == 422
        assert c.post(f"/workbench/conversations/{cid}/edits", json={
            "workbook_id": wb_id, "edits": [{"sheet": "Ledger", "cell": "A1"}]}).status_code == 422
        assert c.post(f"/workbench/conversations/{cid}/edits", json={
            "workbook_id": "nope", "edits": [{"sheet": "Ledger", "cell": "A1", "value": 1}]}).status_code == 404


def test_user_formula_check():
    check_user_formula("=SUMPRODUCT(A1:A3,B1:B3)+XLOOKUP(1,A1:A3,B1:B3)")
    for bad in ("=WEBSERVICE(A1)", "=SUM(A1:A3", "=SUM(A1))"):
        try:
            check_user_formula(bad)
        except FormulaError:
            continue
        raise AssertionError(f"{bad} should be refused")


def test_list_by_document_finds_the_existing_workbench(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={
            "client_id": "c1", "document_ids": [doc.id], "client_name": "Okonkwo Agro"}).json()["conversation"]["id"]
        found = c.get("/workbench/conversations", params={"document_id": doc.id}).json()["conversations"]
        assert [x["id"] for x in found] == [cid]
        assert c.get("/workbench/conversations", params={"document_id": 99999}).json()["conversations"] == []


def test_trial_balance_fast_path_only_for_questions():
    from litchai.workbench.engine import _tb_question

    assert _tb_question("Does the trial balance balance?")
    assert _tb_question("What is the profit before tax?")
    assert _tb_question("Build the P&L as a new sheet")
    # The sheet's name alone is not the intent, and edits always go to the model.
    assert not _tb_question("Add a column that shows debit minus credit for each row on the trial balance")
    assert not _tb_question("Add Total Credit column on Trial balance")
    assert not _tb_question("Sort the trial balance by account code")
    assert not _tb_question("Highlight the rows on the trial balance where the balance is negative")

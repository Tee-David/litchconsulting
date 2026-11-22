"""S5: formatting (bold, italic, colours, borders, alignment, wrap) and merge, with undo."""
from __future__ import annotations

import io

from openpyxl import load_workbook
from procrastinate import testing
from test_workbench_api import _client, _setup

from litchai.queue import queue
from litchai.workbench.styles import StyleError, clean


def test_clean_refuses_bad_styles():
    assert clean({"b": 1, "bg": "#eef1fb", "ha": "center"}) == {"b": True, "bg": "EEF1FB", "ha": "center"}
    for bad in ({"zz": True}, {"bg": "blue"}, {"ha": "middle"}):
        try:
            clean(bad)
        except StyleError:
            continue
        raise AssertionError(bad)


def test_format_cells_merge_and_undo(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        wid = f"doc-{doc.id}"

        def book():
            dl = c.get(f"/workbench/conversations/{cid}/workbooks/{wid}.xlsx")
            return load_workbook(io.BytesIO(dl.content))

        def undo(r):
            u = c.post(f"/workbench/conversations/{cid}/batches/{r.json()['batch']['id']}/undo")
            assert u.status_code == 200 and u.json()["batch"]["status"] == "accepted", u.text

        before = book()["Bank"]["A1"].value
        style = {"b": True, "i": True, "fc": "1F3A8A", "bg": "EEF1FB", "ha": "center", "wrap": True,
                 "bt": True, "bb": True}
        r = c.post(f"/workbench/conversations/{cid}/edits", json={"workbook_id": wid, "edits": [
            {"sheet": "Bank", "cell": "A1", "style": style},
            {"sheet": "Bank", "cell": "J5", "value": 12, "style": {"u": True}}]})
        assert r.status_code == 200, r.text
        ws = book()["Bank"]
        a1 = ws["A1"]
        assert a1.value == before                       # a format-only edit keeps the value
        assert a1.font.b and a1.font.i and a1.font.color.rgb.endswith("1F3A8A")
        assert a1.fill.fgColor.rgb.endswith("EEF1FB") and a1.alignment.horizontal == "center"
        assert a1.alignment.wrap_text and a1.border.top.style == "thin" and a1.border.bottom.style == "thin"
        assert ws["J5"].value == 12 and ws["J5"].font.u == "single"
        win = c.get(f"/workbench/conversations/{cid}/workbooks/{wid}/sheets/Bank").json()
        s = next(x for x in win["cells"] if x["ref"] == "A1")["s"]
        assert s["b"] and s["bg"] == "EEF1FB" and s["ha"] == "center"
        undo(r)
        a1 = book()["Bank"]["A1"]
        assert not a1.font.b and a1.fill.fill_type is None and a1.border.top.style is None

        # Merge A1:C1 hides B1/C1 values; undo brings them back.
        base = f"/workbench/conversations/{cid}/workbooks/{wid}/sheets/Bank/action"
        b1 = book()["Bank"]["B1"].value
        r = c.post(base, json={"action": "merge", "range": "A1:C1", "author": "Tee-David"})
        assert r.status_code == 200, r.text
        assert "A1:C1" in [str(m) for m in book()["Bank"].merged_cells.ranges]
        win = c.get(f"/workbench/conversations/{cid}/workbooks/{wid}/sheets/Bank").json()
        assert "A1:C1" in win["merged"]
        undo(r)
        ws = book()["Bank"]
        assert not ws.merged_cells.ranges and ws["B1"].value == b1
        assert c.post(base, json={"action": "unmerge", "range": "A1:C1"}).status_code == 409
        assert c.post(f"/workbench/conversations/{cid}/edits", json={"workbook_id": wid, "edits": [
            {"sheet": "Bank", "cell": "A1", "style": {"bg": "red"}}]}).status_code == 422


def test_style_aliases_and_borders():
    assert clean({"bold": True, "fill": "dbeafe", "border": "bottom", "align": "centre"}) == {
        "b": True, "bg": "DBEAFE", "bt": False, "bb": True, "bl": False, "br": False, "ha": "center"}
    assert clean({"border": True})["bl"] is True


def test_write_cells_never_empties_a_cell_by_accident(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        base = f"/workbench/conversations/{cid}/tools/write_cells"
        bad = c.post(base, json={"args": {"sheet": "Bank", "cells": [{"cell": "A1"}]}})
        assert bad.status_code == 422 and "nothing to write" in bad.json()["detail"]
        ok = c.post(base, json={"args": {"sheet": "Bank", "cells": [
            {"cell": "A1", "style": {"bold": True, "fill": "DBEAFE", "border": "bottom"}}]}})
        assert ok.status_code == 200, ok.text
        # v8: the source is copied into the working book first, then styled there
        op = next(o for o in ok.json()["batch"]["ops"] if o["op"] == "set_cell")
        assert op["style"]["b"] is True and op["style"]["bg"] == "DBEAFE" and op["new_value"] == op["old_value"]

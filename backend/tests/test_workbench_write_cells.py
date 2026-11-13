"""write_cells: totals rows, labels and values next to rows, as one checked proposal."""
from __future__ import annotations

from procrastinate import testing
from test_workbench_api import _client, _setup

from litchai.queue import queue


def test_write_cells_proposes_checked_formulas(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        url = f"/workbench/conversations/{cid}/tools/write_cells"
        r = c.post(url, json={"args": {"sheet": "Ledger", "reason": "totals", "cells": [
            {"cell": "H1", "value": "Check"},
            {"cell": "H2", "formula": "SUM(1,2)", "number_format": "#,##0.00"},
            {"cell": "H3", "value": "=H2*2"}]}})
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["batch"]["status"] == "pending" and out["data"]["cells"] == 3
        assert out["data"]["formula_results"][0]["formula"] == "=SUM(1,2)"
        assert out["data"]["formula_results"][0]["result"] == 3
        assert out["data"]["formula_results"][1] == {"cell": "H3", "formula": "=H2*2", "result": 6}
        # Refused: unknown function, bad cell, unknown sheet.
        assert c.post(url, json={"args": {"cells": [{"cell": "A1", "formula": "=WEBSERVICE(1)"}]}}
                      ).status_code == 422
        assert c.post(url, json={"args": {"cells": [{"cell": "1A", "value": 1}]}}).status_code == 422
        assert c.post(url, json={"args": {"sheet": "Nope", "cells": [{"cell": "A1", "value": 1}]}}
                      ).status_code == 422


def test_write_cells_is_offered_for_totals_rows():
    from litchai.ai.decision import HeuristicDecisionLayer
    from litchai.workbench.tools import TOOLS

    picked = HeuristicDecisionLayer().select_tools(
        "Add formulas below the debit and credit columns for their totals", list(TOOLS), k=5)
    assert picked[0] == "write_cells" or "write_cells" in picked[:3]

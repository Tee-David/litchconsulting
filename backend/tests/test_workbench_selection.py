"""A6: "this" means the selected range. A7: standing instructions per workbench."""
from __future__ import annotations

from procrastinate import testing
from test_workbench_api import _client, _setup

from litchai.queue import queue
from litchai.workbench.engine import selection_matters


def test_selection_counts_only_when_the_question_points_at_it():
    assert selection_matters("Sum these cells", "'Bank'!B2:B9")
    assert selection_matters("explain this", "'Bank'!C4")
    assert selection_matters("What is in the selected range?", "Bank!A1:B2")
    assert not selection_matters("What is the profit before tax?", "'Bank'!A1")
    assert not selection_matters("sum these", None)


def test_instructions_are_saved_on_the_workbench(tmp_path):
    app, _, doc, _ = _setup(tmp_path)
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        r = c.put(f"/workbench/conversations/{cid}/instructions",
                  json={"text": "  Use IFRS names.\nAmounts in NGN thousands.  "})
        assert r.status_code == 200, r.text
        assert r.json()["conversation"]["instructions"] == "Use IFRS names.\nAmounts in NGN thousands."
        got = c.get(f"/workbench/conversations/{cid}").json()
        conv = got.get("conversation", got)
        assert conv["instructions"].startswith("Use IFRS names.")
        assert c.put(f"/workbench/conversations/{cid}/instructions", json={"text": "x" * 1501}).status_code == 422

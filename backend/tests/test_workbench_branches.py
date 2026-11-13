"""A1/A5: edit-and-resend and regenerate keep earlier branches; Good/Bad votes are stored."""
from __future__ import annotations

from procrastinate import testing
from test_workbench_api import _client, _setup

from litchai.queue import queue


def _turn(c, cid, message, **extra):
    r = c.post(f"/workbench/conversations/{cid}/messages", params={"stream": "false"},
               json={"message": message, **extra})
    assert r.status_code == 200, r.text


def test_replace_last_keeps_branches_and_feedback(tmp_path):
    app, _, doc, _ = _setup(tmp_path, [])  # no model: degraded turns are enough here
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        _turn(c, cid, "first question")
        _turn(c, cid, "second question")
        msgs = c.get(f"/workbench/conversations/{cid}").json()["conversation"]["messages"]
        assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]

        # Edit the last question: the old pair becomes branch 1 of the new question.
        _turn(c, cid, "second question, edited", replace_last=True)
        msgs = c.get(f"/workbench/conversations/{cid}").json()["conversation"]["messages"]
        assert len(msgs) == 4 and msgs[2]["content"] == "second question, edited"
        assert [b["user"]["content"] for b in msgs[2]["branches"]] == ["second question"]
        assert msgs[2]["branches"][0]["assistant"]["role"] == "assistant"

        # Regenerate: same question again; both earlier versions stay.
        _turn(c, cid, "second question, edited", replace_last=True)
        msgs = c.get(f"/workbench/conversations/{cid}").json()["conversation"]["messages"]
        assert len(msgs) == 4
        assert [b["user"]["content"] for b in msgs[2]["branches"]] == [
            "second question", "second question, edited"]
        assert all("branches" not in b["user"] for b in msgs[2]["branches"])

        # Good / Bad with a note, stored with what produced the answer; null takes it back.
        url = f"/workbench/conversations/{cid}/messages/3/feedback"
        r = c.post(url, json={"vote": "bad", "note": "wrong sheet", "author": "Tee-David"})
        assert r.status_code == 200, r.text
        fb = r.json()["conversation"]["messages"][3]["feedback"]
        assert fb["vote"] == "bad" and fb["note"] == "wrong sheet" and fb["by"] == "Tee-David"
        assert "tools" in fb and "layer" in fb and "model" in fb
        r = c.post(url, json={"vote": None})
        assert "feedback" not in r.json()["conversation"]["messages"][3]
        # Only Sage answers take a vote.
        assert c.post(f"/workbench/conversations/{cid}/messages/2/feedback",
                      json={"vote": "good"}).status_code == 404
        assert c.post(f"/workbench/conversations/{cid}/messages/99/feedback",
                      json={"vote": "good"}).status_code == 404

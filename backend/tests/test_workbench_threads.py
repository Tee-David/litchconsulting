"""D1: several chats per workbench. Proposals and versions stay with the workbench."""
from __future__ import annotations

from procrastinate import testing
from test_workbench_api import _client, _setup

from litchai.queue import queue


def test_new_chat_and_switch(tmp_path):
    app, _, doc, _ = _setup(tmp_path, [])
    with queue.replace_connector(testing.InMemoryConnector()), _client(app) as c:
        cid = c.post("/workbench/conversations", json={"document_ids": [doc.id]}
                     ).json()["conversation"]["id"]
        say = lambda m: c.post(f"/workbench/conversations/{cid}/messages",  # noqa: E731
                               params={"stream": "false"}, json={"message": m})
        say("first chat question")
        conv = c.get(f"/workbench/conversations/{cid}").json()["conversation"]
        first_id = conv["thread_id"]
        assert conv["threads"] == [] and len(conv["messages"]) == 2

        conv = c.post(f"/workbench/conversations/{cid}/threads").json()["conversation"]
        assert conv["messages"] == [] and conv["thread_id"] != first_id
        assert conv["threads"] == [{"id": first_id, "title": "first chat question",
                                    "at": conv["threads"][0]["at"], "questions": 1}]
        assert "messages" not in conv["threads"][0]
        say("second chat question")

        # Open the first chat again: the second one goes to the list.
        conv = c.post(f"/workbench/conversations/{cid}/threads/{first_id}/open").json()["conversation"]
        assert conv["thread_id"] == first_id and conv["messages"][0]["content"] == "first chat question"
        assert [t["title"] for t in conv["threads"]] == ["second chat question"]
        # An empty new chat is not kept in the list.
        c.post(f"/workbench/conversations/{cid}/threads")
        conv = c.post(f"/workbench/conversations/{cid}/threads").json()["conversation"]
        assert sorted(t["title"] for t in conv["threads"]) == ["first chat question",
                                                                 "second chat question"]
        assert c.post(f"/workbench/conversations/{cid}/threads/t-nope/open").status_code == 404

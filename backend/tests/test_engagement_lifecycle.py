"""Engagement lifecycle: state machine, period lock, deliverable, recompile diff (Phase 4)."""
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from procrastinate import testing

from litchai.api import create_app
from litchai.categorize.memory_store import InMemoryStore
from litchai.db import InMemoryRepository, LineItem
from litchai.documents.engagement_state import EngagementStatus, can_transition, is_frozen
from litchai.documents.state import IllegalTransition
from litchai.queue import queue
from litchai.review.diff import diff_figures
from litchai.storage import Storage

CLIENT = "11111111-1111-1111-1111-111111111111"


# --- state machine ---------------------------------------------------------


def test_engagement_happy_path():
    path = ["open", "in_review", "approved", "locked", "reopened", "in_review"]
    for src, dst in zip(path, path[1:]):
        assert can_transition(src, dst)


def test_frozen_states():
    assert is_frozen(EngagementStatus.APPROVED)
    assert is_frozen(EngagementStatus.LOCKED)
    assert not is_frozen(EngagementStatus.IN_REVIEW)


def test_repo_transition_and_illegal():
    repo = InMemoryRepository()
    eng = repo.create_engagement(CLIENT, "FY2025", "annual_report_ias1")
    assert repo.transition_engagement(eng.id, "in_review").status == "in_review"
    assert repo.transition_engagement(eng.id, "approved").status == "approved"
    with pytest.raises(IllegalTransition):
        repo.transition_engagement(eng.id, "open")  # approved can't go straight back to open


# --- recompile diff --------------------------------------------------------


def test_diff_figures_reports_changes_adds_removes():
    old = {"revenue.goods": 100.0, "bank.charges": 50.0, "admin.rent_utilities": 20.0}
    new = {"revenue.goods": 130.0, "bank.charges": 50.0, "revenue.services": 10.0}
    diffs = {d.figure: d for d in diff_figures(old, new)}
    assert diffs["revenue.goods"].kind == "changed" and diffs["revenue.goods"].delta == 30.0
    assert diffs["revenue.services"].kind == "added"
    assert diffs["admin.rent_utilities"].kind == "removed"
    assert "bank.charges" not in diffs  # unchanged → not reported


# --- API lifecycle + period lock ------------------------------------------


def _harness(tmp_path):
    repo = InMemoryRepository()
    store = InMemoryStore()

    @contextmanager
    def repo_provider():
        yield repo

    @contextmanager
    def store_provider():
        yield store

    app = create_app(repo_provider=repo_provider, storage=Storage(root=tmp_path),
                     store_provider=store_provider)
    return repo, testing.InMemoryConnector(), app


def test_approve_marks_deliverable_and_locks_corrections(tmp_path):
    repo, conn, app = _harness(tmp_path)
    eng = repo.create_engagement(CLIENT, "FY2025", "annual_report_ias1")
    doc = repo.create_document(CLIENT, "s.xlsx", "application/pdf", "h", 10, engagement_id=eng.id)
    [li] = repo.add_line_items([
        LineItem(id=0, document_id=doc.id, raw_text="POS", normalized_text="paystack",
                 direction="in", amount=100.0, category_code="revenue.goods", needs_review=True)
    ])
    repo.record_generated_file(eng.id, "annual_report_ias1", "1.0.0", "passed")

    with queue.replace_connector(conn), TestClient(app) as client:
        assert client.post(f"/engagements/{eng.id}/submit").json()["status"] == "in_review"
        approved = client.post(f"/engagements/{eng.id}/approve").json()
        assert approved["status"] == "approved"
        assert approved["deliverables"] == 1

        # period lock: corrections refused while approved
        resp = client.post(f"/documents/{doc.id}/lines/{li.id}/recategorize",
                           params={"new_code": "revenue.services"})
        assert resp.status_code == 409

        # reopen → in_review unfreezes corrections
        assert client.post(f"/engagements/{eng.id}/reopen").json()["status"] == "reopened"
        assert client.post(f"/engagements/{eng.id}/submit").json()["status"] == "in_review"
        ok = client.post(f"/documents/{doc.id}/lines/{li.id}/recategorize",
                        params={"new_code": "revenue.services"})
        assert ok.status_code == 200


def test_illegal_engagement_transition_409(tmp_path):
    repo, conn, app = _harness(tmp_path)
    eng = repo.create_engagement(CLIENT, "FY2025", "pnl")
    with queue.replace_connector(conn), TestClient(app) as client:
        # open → approved is not allowed (must go through in_review)
        assert client.post(f"/engagements/{eng.id}/approve").status_code == 409

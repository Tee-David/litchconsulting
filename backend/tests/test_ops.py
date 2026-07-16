"""Phase 6 hardening: NDPA erasure, observability, backup rotation, heartbeat."""
from datetime import date

from litchai.categorize.memory_store import InMemoryStore, MemoryRecord
from litchai.db import InMemoryRepository, LineItem
from litchai.ops.backup import RetentionPolicy, select_for_deletion
from litchai.ops.erasure import erase_client
from litchai.ops.heartbeat import heartbeat_burst
from litchai.ops.observability import document_status_counts, summarize

CLIENT = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"


# --- NDPA erasure ----------------------------------------------------------


def test_erase_client_removes_data_and_flags_global_memory():
    repo = InMemoryRepository()
    store = InMemoryStore()

    eng = repo.create_engagement(CLIENT, "FY2025", "pnl")
    doc = repo.create_document(CLIENT, "s.xlsx", "application/pdf", "h", 10, engagement_id=eng.id)
    repo.add_line_items([
        LineItem(id=0, document_id=doc.id, raw_text="POS", normalized_text="paystack",
                 direction="in", amount=1.0, category_code="revenue.goods")
    ])
    store.add(MemoryRecord(id=0, normalized_text="paystack", category_code="revenue.goods",
                           source="human_correction", client_id=CLIENT))            # client-scoped
    store.add(MemoryRecord(id=0, normalized_text="paystack", category_code="revenue.goods",
                           source="approved_run", client_id=None))                   # global, matching
    store.add(MemoryRecord(id=0, normalized_text="salary", category_code="admin.staff_salaries",
                           source="seed_template", client_id=None))                  # global, unrelated

    # another client's data must survive
    other = repo.create_document(OTHER, "o.xlsx", "application/pdf", "h2", 10)
    repo.add_line_items([LineItem(id=0, document_id=other.id, raw_text="x", normalized_text="x",
                                  direction="in", amount=1.0)])

    report = erase_client(repo, store, CLIENT)

    assert report.documents == 1
    assert report.line_items == 1
    assert report.engagements == 1
    assert report.client_memory == 1
    assert report.global_flagged == 1                     # the matching global row flagged
    assert repo.list_documents(CLIENT) == []
    assert len(repo.list_documents(OTHER)) == 1           # other client untouched
    globals_ = {r.normalized_text: r for r in store.all_records() if r.client_id is None}
    assert globals_["paystack"].stale is True
    assert globals_["salary"].stale is False              # unrelated global memory retained


# --- observability ---------------------------------------------------------


def test_observability_summary():
    repo = InMemoryRepository()
    d1 = repo.create_document(CLIENT, "a.xlsx", "application/pdf", "h1", 1)
    repo.transition_document(d1.id, "scanning")
    repo.transition_document(d1.id, "rejected")
    repo.create_document(CLIENT, "b.xlsx", "application/pdf", "h2", 1)  # received
    events = [
        {"rung": 1, "accepted": True, "line_item_id": 1},
        {"rung": 4, "accepted": True, "line_item_id": 2},
    ]
    summary = summarize(repo.list_documents(), events)
    assert summary["documents_total"] == 2
    assert summary["documents_rejected"] == 1
    assert summary["rung4_fallback_rate"] == 0.5
    assert document_status_counts(repo.list_documents())["rejected"] == 1


# --- backup rotation -------------------------------------------------------


def test_backup_retention_keeps_daily_weekly_monthly():
    today = date(2026, 7, 16)
    # one backup per day for ~200 days
    dates = [date.fromordinal(today.toordinal() - i) for i in range(200)]
    policy = RetentionPolicy(keep_daily=7, keep_weekly=4, keep_monthly=6)
    to_delete = set(select_for_deletion(dates, today, policy))
    kept = set(dates) - to_delete

    # last 7 days all kept
    for i in range(7):
        assert date.fromordinal(today.toordinal() - i) in kept
    # bounded: 7 daily + ≤4 weekly + ≤6 monthly
    assert len(kept) <= 7 + 4 + 6
    assert to_delete  # older backups pruned


# --- heartbeat -------------------------------------------------------------


def test_heartbeat_burst_runs():
    assert heartbeat_burst(ms=20) > 0

"""Engagement compile → recompute gate → ReviewPack → assistant (Phase 4).

Exercises the full deliverable path with real headless LibreOffice recompute,
reusing the mapping fixture aux + a binding-complete set of categorized items.
"""
import json
from contextlib import contextmanager

from fastapi.testclient import TestClient
from procrastinate import testing

from litchai.api import create_app
from litchai.ai.provider import FakeProvider
from litchai.categorize.memory_store import InMemoryStore
from litchai.db import InMemoryRepository, LineItem
from litchai.pipeline import compile_engagement
from litchai.queue import queue
from litchai.storage import Storage
from litchai.taxonomy import load_taxonomy

TAX = load_taxonomy()
CLIENT = "11111111-1111-1111-1111-111111111111"

AUX = {
    "client_name": "Mapping Test Ltd",
    "period_label": "For the year ended 31 December 2025",
    "as_at_label": "As at 31 December 2025",
    "schedules": {
        "cost_of_sales": [
            {"label": "Opening inventory", "current": 300, "prior": 250},
            {"label": "Less: Closing inventory", "current": -400, "prior": -300},
        ],
        "ppe_classes": [{"label": "Plant", "cost_opening": 900, "dep_opening": 100, "dep_charge": 50}],
    },
    "sofp": {"cash_prior": 80, "share_capital": {"current": 500, "prior": 500}},
    "bank_recon": {"account_label": "Test Bank | December 2025", "statement_balance": 120, "book_balance": 120},
    "socf": {"opening_cash": {"current": 80, "prior": 60}},
    "schedules_prior": {"revenue.goods": 800, "dist.freight": 40},
}

# (category_code, direction, amount) — binding-complete, mirrors the mapping test.
ITEMS = [
    ("revenue.goods", "in", 700), ("revenue.goods", "in", 300), ("cos.purchases", "out", 450),
    ("dist.freight", "out", 60), ("bank.charges", "out", 15), ("finance.costs.interest", "out", 25),
    ("tax.income_tax", "out", 30), ("capex.ppe.additions", "out", 200),
    ("fin_activity.borrow_proceeds", "in", 150), ("transfers.internal", "out", 999),
]


def _engagement_with_items(repo):
    eng = repo.create_engagement(CLIENT, "FY2025", "annual_report_ias1", aux_inputs=AUX)
    doc = repo.create_document(CLIENT, "s.xlsx", "application/pdf", "h", 10, engagement_id=eng.id)
    repo.add_line_items([
        LineItem(id=0, document_id=doc.id, raw_text=code, normalized_text=code,
                 direction=direction, amount=float(amount), category_code=code,
                 category_source="exact", confidence=1.0)
        for code, direction, amount in ITEMS
    ])
    return eng


def test_compile_engagement_gates_and_marks_in_review(tmp_path):
    repo = InMemoryRepository()
    eng = _engagement_with_items(repo)

    result = compile_engagement(
        repo, eng.id, taxonomy=TAX, workdir=tmp_path, storage=Storage(root=tmp_path)
    )

    # G1 gate = zero *formula* errors (valid formulas); content correctness is HITL's job.
    assert result.ok is True
    assert result.errors == []
    assert repo.get_engagement(eng.id).status == "in_review"     # open → in_review on a clean compile
    labels = {s.label for s in result.review_pack.summaries}
    assert "Revenue" in labels
    # this synthetic aux isn't a balanced set, so the review-facts layer surfaces
    # the untied check cells for the reviewer (grounding layer working on a real
    # compiled engagement) — a fully-articulated engagement would tie to zero.
    assert any(a.code == "check_not_zero" for a in result.review_pack.anomalies)


def _first_cell_name(prompt: str) -> str:
    line = next(line for line in prompt.splitlines() if line.startswith("Cells you can explain:"))
    return line.split(":", 1)[1].split(",")[0].strip()


def test_ask_endpoint_explains_over_a_real_compiled_pack(tmp_path):
    repo = InMemoryRepository()
    eng = _engagement_with_items(repo)

    @contextmanager
    def repo_provider():
        yield repo

    @contextmanager
    def store_provider():
        yield InMemoryStore()

    provider = FakeProvider(
        responder=lambda p: json.dumps({"intent": "explain_cell", "target": _first_cell_name(p)})
    )
    app = create_app(
        repo_provider=repo_provider, storage=Storage(root=tmp_path),
        store_provider=store_provider, provider_factory=lambda: provider,
    )

    with queue.replace_connector(testing.InMemoryConnector()), TestClient(app) as client:
        body = client.post(f"/engagements/{eng.id}/ask", params={"question": "explain a cell"}).json()

    assert body["intent"] == "explain_cell"
    assert body["answer"]                    # a deterministic explanation from the ReviewPack
    assert body["grounded_refs"]             # traces to a real cell ref (explain-only, never invented)

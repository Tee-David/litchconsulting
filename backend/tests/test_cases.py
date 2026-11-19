"""Real-world edge cases: the key is consistent, and the tools alone (no model) can
prove each planted problem. Live runs: python -m litchai.evals.run_cases."""
from __future__ import annotations

import pytest

from litchai.evals.cases import found, registry, score
from litchai.evals.workbench import passing_gate
from litchai.workbench.formats import to_working_copy
from litchai.workbench.session import InMemoryBlobStore, InMemoryConversationStore, Workbench
from litchai.workbench.tools import run_tool


def _job(slug):
    case = registry()[slug]()
    w = Workbench(InMemoryBlobStore(), InMemoryConversationStore(), gate=passing_gate)
    conv = w.create(client_id=None, client_name=case.client, period_label=case.period)
    for i, (name, data) in enumerate(case.files.items(), start=1):
        c = to_working_copy(data, name, wb_id=f"doc-{i}", document_id=i)
        w.attach_bytes(conv, c.xlsx, name=name, origin=c.origin, document_id=i)
    return case, w, conv


def test_cases_build_the_same_every_time():
    for slug, build in registry().items():
        a, b = build(), build()
        assert a.files == b.files and a.figures == b.figures, slug
        assert a.problems and a.prompts


def test_scoring_needs_the_words_or_the_amount_beside_them():
    case = registry()["supermarket"]()
    p1 = case.problems[0]
    assert found(p1, "The Lekki batches for 3-9 Nov were uploaded twice.")
    assert not found(p1, "Sales look fine.")
    s = score(case, ["Lekki sales are duplicated for one week."])
    assert s["found"] == 1 and s["of"] == len(case.problems)


def test_supermarket_problems_are_provable_with_the_tools():
    """Each planted amount can be computed with query_sql alone: the case is fair."""
    pytest.importorskip("duckdb")
    case, w, conv = _job("supermarket")
    ctx = w.context(conv)
    f = case.figures

    def one(sql):
        return run_tool(ctx, "query_sql", {"sql": sql}).data["rows"][0][0]

    pos = "freshmart_pos_export_q4_2025"
    voids = one(f"SELECT round(sum(gross_sales_incl_vat), 2) FROM {pos} WHERE status = 'VOID'")
    assert voids == pytest.approx(f["voids_gross"])
    dup = one(f"SELECT round(sum(g), 2) FROM (SELECT batch_id, category, "
              f"sum(gross_sales_incl_vat) - max(gross_sales_incl_vat) AS g FROM {pos} "
              f"GROUP BY batch_id, category HAVING count(*) > 1)")
    assert dup == pytest.approx(f["duplicates_gross"])
    fees = one("SELECT round(sum(processor_fee), 2) FROM card_settlement_report_q4_2025")
    assert fees == pytest.approx(f["card_fees"])
    assert one("SELECT round(sum(cash_per_till - cash_banked), 2) FROM cash_banking "
               "WHERE branch = 'Surulere'") == pytest.approx(f["cash_short"])
    assert one(f"SELECT count(*) FROM {pos} WHERE branch = 'Ikeja' AND "
               f"CAST(date AS VARCHAR) LIKE '%2025-12-24%'") == 0

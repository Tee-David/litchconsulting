"""Real-world edge cases: the key is consistent, and the tools alone (no model) can
prove each planted problem. Live runs: python -m litchai.evals.run_cases."""
from __future__ import annotations

import io

import pytest
from openpyxl import load_workbook

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
        assert a.figures == b.figures and list(a.files) == list(b.files), slug
        for name in a.files:  # xlsx files carry a save time, so compare their cells
            if name.endswith(".xlsx"):
                va = [[c.value for c in r] for ws in load_workbook(io.BytesIO(a.files[name]))
                      for r in ws.iter_rows()]
                vb = [[c.value for c in r] for ws in load_workbook(io.BytesIO(b.files[name]))
                      for r in ws.iter_rows()]
                assert va == vb, name
            else:
                assert a.files[name] == b.files[name], name
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


def test_contractor_problems_are_provable_with_the_tools():
    pytest.importorskip("duckdb")
    case, w, conv = _job("contractor")
    ctx = w.context(conv)
    f = case.figures

    def one(sql):
        return run_tool(ctx, "query_sql", {"sql": sql}).data["rows"][0][0]

    assert one("SELECT round(sum(retention_held), 2) FROM customer_receipts_2025")         == pytest.approx(f["retention"])
    assert one("SELECT count(*) - count(DISTINCT invoice_no) FROM invoices") == 1
    wht = one("SELECT round(sum(wht_deducted - invoice_total / 1.075 * 0.05), 2) "
              "FROM customer_receipts_2025 WHERE client = 'Abeokuta Water Board'")
    assert wht == pytest.approx(f["over_wht"])



def test_sales_checks_find_the_planted_revenue_problems():
    case, w, conv = _job("supermarket")
    got = {f["check"]: f["amount"] for f in run_tool(w.context(conv), "sales_checks", {})
           .data["findings"]}
    f = case.figures
    assert got["duplicates"] == pytest.approx(f["duplicates_gross"])
    assert got["voids_in_totals"] == pytest.approx(f["voids_gross"])
    assert got["vat_on_exempt"] == pytest.approx(f["vat_on_basic_food"])
    assert got["cash_short"] == pytest.approx(f["cash_short"])
    assert got["processor_fees"] == pytest.approx(f["card_fees"])
    assert got["cut_off"] == pytest.approx(f["dec31_gross"])
    assert got["banked_without_sales"] == pytest.approx(f["unrecorded_gross"])


def _findings(slug, tool):
    case, w, conv = _job(slug)
    return case, run_tool(w.context(conv), tool, {}).data["findings"]


def test_receivables_checks_find_the_contractor_problems_exactly():
    case, fs = _findings("contractor", "receivables_checks")
    got = {f["check"]: f["amount"] for f in fs}
    f = case.figures
    assert got["advance_as_revenue"] == f["advance"]
    assert got["retention_not_recorded"] == pytest.approx(f["retention"])
    assert got["wht_rate_differs"] == pytest.approx(f["over_wht"])
    assert got["wht_no_credit_note"] == pytest.approx(f["wht_without_credit_note"])
    assert got["over_billing"] == pytest.approx(f["over_billed"])
    assert got["vat_not_charged"] == pytest.approx(f["villa_vat"])
    assert got["materials_on_site"] == f["materials_on_site"]
    assert "duplicate_invoices" in got
    assert sum(1 for x in fs if x["check"] == "wht_rate_differs") == 1  # no false alarm


def test_grant_checks_find_the_ngo_problems_exactly():
    case, fs = _findings("ngo", "grant_checks")
    got = {x["check"]: x["amount"] for x in fs}
    f = case.figures
    assert got["ineligible_costs"] == f["ineligible"]
    assert got["wrong_grant"] == f["misallocated"]
    assert got["staff_cost_over_timesheet"] == pytest.approx(f["salary_over"])
    assert got["later_year_tranche"] == f["gb_deferred"]
    assert got["fx_rate"] == pytest.approx(f["fx_understated"])
    assert got["restricted_unspent"] == pytest.approx(f["deferred_ga"])
    assert sum(1 for x in fs if x["check"] == "staff_cost_over_timesheet") == 1


def test_sales_checks_give_the_corrected_sales_and_vat():
    case, w, conv = _job("supermarket")
    c = run_tool(w.context(conv), "sales_checks", {}).data["corrected"]
    assert c["net_sales"] == pytest.approx(case.figures["true_revenue"])
    assert c["output_vat"] == pytest.approx(case.figures["true_output_vat"])


def test_check_summaries_are_sentences_a_person_can_read():
    for slug, tool, need in (("supermarket", "sales_checks", 7), ("contractor",
                             "receivables_checks", 8), ("ngo", "grant_checks", 6),
                            ("payroll", "payroll_checks", 6)):
        case, w, conv = _job(slug)
        out = run_tool(w.context(conv), tool, {})
        assert score(case, [out.summary])["found"] >= need, slug



def test_payroll_checks_find_the_payroll_problems_exactly():
    case, fs = _findings("payroll", "payroll_checks")
    got = {x["check"]: x["amount"] for x in fs}
    f = case.figures
    assert got["not_in_staff_master"] == f["ghost_paid"]
    assert got["paid_after_exit"] == f["leaver_paid"]
    assert got["paid_twice"] == f["duplicate_paid"]
    assert got["pension_not_deducted"] == pytest.approx(f["pension_missing"])
    assert got["paye_wrong_rules"] == pytest.approx(abs(f["paye_gap"]))
    assert got["payroll_vs_books"] == pytest.approx(f["december_gross"])
    assert "shared_bank_account" in got


@pytest.mark.parametrize("slug,kind", [("importer", "imports"), ("property", "rent"),
                                       ("manufacturer", "stock"), ("fintech", "settlements"),
                                       ("group", "group"), ("purchases", "purchases")])
def test_sector_cases_are_found_by_the_checks_alone(slug, kind):
    """Cases 5-10: the standard checks find every planted problem, with the key amount."""
    case, w, conv = _job(slug)
    ctx = w.context(conv)
    out = run_tool(ctx, "sector_checks", {"kind": kind})
    s = score(case, [out.summary])
    assert s["found"] == s["of"], [p["id"] for p in s["problems"] if not p["found"]]
    auto = run_tool(ctx, "sector_checks", {})  # "auto" keeps the same findings
    assert score(case, [auto.summary])["found"] == s["of"]


def test_messy_file_traps_are_found_and_the_table_is_read():
    """Case 11: text numbers, text dates in both orders and copied rows are all flagged,
    and a title row above the header does not stop the table being read."""
    case, w, conv = _job("messy")
    out = run_tool(w.context(conv), "flag_anomalies", {})
    s = score(case, [out.summary])
    assert s["found"] == s["of"], [p["id"] for p in s["problems"] if not p["found"]]
    by = out.data["by_kind"]
    assert by["text_date"] == case.figures["text_dates"]
    assert by["text_number"] == case.figures["text_amounts"]
    assert by["duplicate"] == 4


def test_fallback_runs_the_checks_that_fit_the_files_when_the_words_do_not():
    """No model and no keyword step: the checks that fit the job run (fintech run, 20 Nov)."""
    from litchai.workbench.engine import _plan_for, fitting_checks

    checks = [t for t, _ in fitting_checks({"trial_balance", "sales_report"}, "")]
    assert checks == ["review_points", "sales_checks", "sector_checks"]
    plan = _plan_for(True, checks)
    assert [t for t, _ in plan("How much do they really owe us?")] == checks
    assert plan("delete the sheet") == [] or plan("delete the sheet")[0][0] != "review_points"

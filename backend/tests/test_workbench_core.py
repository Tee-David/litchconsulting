"""Workbench core (Phase 3.6–3.8): whole-workbook model, profiles, read-only
SQL, typed tools, operation logs, apply / undo. Offline and deterministic;
the recompute gate is injected (LibreOffice is exercised on the VM)."""
from __future__ import annotations

import io

import pytest
from openpyxl import load_workbook
from workbench_fixtures import (
    GOLDEN,
    ledger_bank_xlsx,
    scripted_categoriser,
    trial_balance_xlsx,
)

from litchai.taxonomy import load_taxonomy
from litchai.workbench.context import ToolContext, ToolError
from litchai.workbench.formula import Evaluator, FormulaError, check_formula
from litchai.workbench.model import load_csv, load_xlsx
from litchai.workbench.ops import GateResult, apply_ops, inverse_ops
from litchai.workbench.profile import benford, profile_workbook
from litchai.workbench.session import (
    InMemoryBlobStore,
    InMemoryConversationStore,
    Workbench,
    WorkbenchError,
)
from litchai.workbench.sqlquery import SqlRejected, query_sql
from litchai.workbench.tools import TOOLS, run_tool, validate_call


def _ctx(*extra) -> ToolContext:
    wb = load_xlsx(ledger_bank_xlsx(), wb_id="doc-1", name="ledger.xlsx")
    books = {"doc-1": wb}
    for i, data in enumerate(extra, start=2):
        books[f"doc-{i}"] = load_xlsx(data, wb_id=f"doc-{i}", name=f"f{i}.xlsx")
    return ToolContext(books, client_name="Okonkwo Agro", period_label="Q1 2025",
                       taxonomy=load_taxonomy(), categoriser=scripted_categoriser)


def passing_gate(xlsx: bytes) -> GateResult:
    return GateResult("passed", formulas=1)


def blocking_gate(xlsx: bytes) -> GateResult:
    return GateResult("blocked", errors=["P&L!C9: #REF!"])


# --- model / profile ---------------------------------------------------------------
def test_reads_every_sheet_not_just_the_largest():
    wb = load_xlsx(ledger_bank_xlsx(), wb_id="d", name="x")
    assert list(wb.sheets) == ["Ledger", "Bank", "Notes"]
    p = profile_workbook(wb, level=3)
    by = {s["sheet"]: s for s in p["sheets"]}
    assert by["Ledger"]["table"]["rows"] == 12
    assert by["Bank"]["table"]["rows"] == 11
    assert by["Notes"]["table"] is None  # a cover note is not a table
    date_col = next(c for c in by["Ledger"]["columns"] if c["role"] == "date")
    assert date_col["text_date_count"] == 1 and date_col["text_dates"] == ["A11"]
    assert by["Ledger"]["duplicates"]["groups"] == 1
    assert by["Ledger"]["totals"]["inflow"] == GOLDEN["ledger_credits"]
    assert by["Ledger"]["totals"]["outflow"] == GOLDEN["ledger_debits"]


def test_csv_loader_coerces_numbers_and_dates():
    wb = load_csv(b"Date,Narration,Amount\n2025-01-02,POS,\"1,250.50\"\n03/01/2025,ATM,(500)\n",
                  wb_id="c", name="c.csv")
    sh = wb.sheet(None)
    assert sh.value(2, 3) == 1250.5 and sh.value(3, 3) == -500
    assert sh.value(3, 1).isoformat() == "2025-01-03"


def test_benford_needs_enough_data():
    assert benford([1, 2, 3]) is None
    # log-uniform over exactly 6 decades follows Benford by construction
    result = benford([float(10 ** (1 + i / 100.0)) for i in range(600)])
    assert result is not None and result["verdict"] in ("close conformity",
                                                         "acceptable conformity")


# --- SQL ------------------------------------------------------------------------------
def test_query_sql_reads_sheets_with_row_numbers():
    ctx = _ctx()
    res = query_sql(list(ctx.workbooks.values()),
                    "SELECT sum(credit) AS rev, sum(debit) AS exp FROM ledger")
    assert res["rows"] == [[GOLDEN["ledger_credits"], GOLDEN["ledger_debits"]]]
    rows = query_sql(list(ctx.workbooks.values()),
                     "SELECT _row FROM bank WHERE description = 'BANK CHARGES'")["rows"]
    assert rows == [[12]]


@pytest.mark.parametrize("sql", [
    "DROP TABLE ledger",
    "SELECT * FROM read_csv('/etc/passwd')",
    "SELECT * FROM 'secrets.csv'",
    "COPY ledger TO 'out.csv'",
    "SELECT 1; SELECT 2",
    "SELECT * FROM information_schema.tables",
    "ATTACH 'x.db'",
    "SELECT * FROM users",
    "PRAGMA database_list",
    "SELECT getenv('HOME')",
])
def test_query_sql_rejects_anything_but_a_select_over_our_tables(sql):
    ctx = _ctx()
    with pytest.raises(SqlRejected):
        query_sql(list(ctx.workbooks.values()), sql)


def test_query_sql_allows_ctes():
    ctx = _ctx()
    res = query_sql(list(ctx.workbooks.values()),
                    "WITH m AS (SELECT debit FROM ledger WHERE debit > 500000) "
                    "SELECT count(*) FROM m")
    assert res["rows"] == [[5]]


# --- formula evaluator -------------------------------------------------------------------
def test_formula_whitelist():
    check_formula("=SUMIFS(Ledger!$D$2:$D$13,Ledger!$F$2:$F$13,\"Rent\")")
    with pytest.raises(FormulaError):
        check_formula('=WEBSERVICE("http://x")')
    with pytest.raises(FormulaError):
        check_formula("=INDIRECT(A1)")


def test_evaluator_sumifs_and_criteria():
    ctx = _ctx()
    ev = Evaluator(ctx.workbook())
    assert ev.evaluate("=SUM(Bank!C2:C12)", "Bank") == pytest.approx(3_905_000)
    assert ev.evaluate('=SUMIFS(Bank!C2:C12,Bank!C2:C12,">500000")', "Bank") == 3_000_000
    assert ev.evaluate('=IF(Ledger!E2>0,"in","out")', "Ledger") == "in"


# --- tools: golden answers -------------------------------------------------------------------
def test_tool_registry_is_typed_and_bounded():
    assert len(TOOLS) >= 10
    for t in TOOLS:
        assert t.kind in ("read", "write")
        assert t.schema()["type"] == "object"
    with pytest.raises(ToolError):
        validate_call("query_sql", {"sql": 1, "extra": True})
    with pytest.raises(ToolError):
        validate_call("rm_rf", {})


def test_categorise_then_pnl_links_to_source_and_matches_golden():
    ctx = _ctx()
    cat = run_tool(ctx, "categorise_rows", {})
    assert cat.batch.counts()["new_cells"] == 13  # header + 12 rows, nothing overwritten
    assert cat.data["needs_review_count"] == 0
    pnl = run_tool(ctx, "build_statement", {"kind": "pnl"})
    f = pnl.data["figures"]
    assert f["total_revenue"] == GOLDEN["revenue"]
    assert f["total_cost_of_sales"] == GOLDEN["cos"]
    assert f["total_operating_expenses"] == GOLDEN["opex"]
    assert f["net_profit"] == GOLDEN["net_profit"]
    revenue_line = next(o for o in pnl.batch.ops if o.op == "set_cell" and o.new_formula
                        and "Sale of goods" in o.new_formula)
    assert revenue_line.new_formula.startswith("=(SUMIFS(Ledger!$E$2:$E$13")
    assert revenue_line.source_rows and revenue_line.source_rows[0].startswith("Ledger!F")
    assert pnl.batch.counts()["new_sheets"] == 1
    assert "'P&L'!C24" in pnl.citations


def test_cashflow_and_pivot_and_formula_column():
    ctx = _ctx()
    run_tool(ctx, "categorise_rows", {})
    cf = run_tool(ctx, "build_statement", {"kind": "cashflow", "opening_cash": 1_000_000})
    assert cf.data["figures"]["net_operating"] == GOLDEN["net_profit"]
    assert cf.data["figures"]["closing_cash"] == 1_000_000 + GOLDEN["net_profit"]
    pv = run_tool(ctx, "pivot", {"rows_column": "Category", "sheet": "Ledger"})
    assert pv.data["grand_total"] == GOLDEN["ledger_credits"] - GOLDEN["ledger_debits"]
    col = run_tool(ctx, "add_formula_column", {"sheet": "Bank", "kind": "difference",
                                              "header": "Net", "columns": ["Credit", "Debit"]})
    assert col.data["sample_formula"] == "=D2-C2"
    with pytest.raises(ToolError):
        run_tool(ctx, "add_formula_column", {"sheet": "Bank", "kind": "custom", "header": "X",
                                             "template": "=HYPERLINK(\"http://x\")"})


def test_reconcile_golden_and_balance_sheet():
    ctx = _ctx()
    rec = run_tool(ctx, "reconcile", {})
    d = rec.data
    assert d["matched"] == 10
    assert d["balance_per_bank"] == GOLDEN["bank_closing"]
    assert d["balance_per_books"] == GOLDEN["books"]
    assert d["difference"] == 0
    assert [x["description"] for x in d["bank_only"]] == ["BANK CHARGES"]
    assert {x["row"] for x in d["ledger_only"]} == {11, 13}
    diff_cell = next(o for o in rec.batch.ops if o.op == "set_cell" and o.sheet == "Recon"
                     and o.cell == rec.data["key_cells"]["difference"].split("!")[1])
    assert diff_cell.preview_value == 0
    bs_ctx = ToolContext({"tb": load_xlsx(trial_balance_xlsx(), wb_id="tb", name="tb")},
                         taxonomy=load_taxonomy())
    bs = run_tool(bs_ctx, "build_statement", {"kind": "bs"})
    assert bs.data["figures"]["total_assets"] == 18_000_000
    assert bs.data["figures"]["balance_check"] == 0


def test_flag_anomalies_finds_the_planted_issues():
    out = run_tool(_ctx(), "flag_anomalies", {})
    kinds = out.data["by_kind"]
    assert kinds["duplicate"] >= 1 and kinds["text_date"] == 1
    assert any(f["cell"] == "Ledger!B13" for f in out.data["findings"])


def test_tax_compute_reads_the_shared_config():
    ctx = _ctx()
    cit = run_tool(ctx, "tax_compute", {"kind": "cit", "inputs": {
        "net_profit_per_accounts": 200_000_000, "turnover": 900_000_000,
        "total_fixed_assets": 300_000_000}}).data
    assert cit["small_company"] is False and cit["rate_pct"] == 30
    assert cit["cit"] == 60_000_000 and cit["development_levy"] == 8_000_000
    small = run_tool(ctx, "tax_compute", {"kind": "cit", "inputs": {
        "net_profit_per_accounts": 4_555_000, "turnover": 7_500_000}}).data
    assert small["small_company"] is True and small["total_tax"] == 0
    vat = run_tool(ctx, "tax_compute", {"kind": "vat", "inputs": {
        "standard_rated_sales": 10_000_000, "standard_rated_purchases": 4_000_000}}).data
    assert vat["net_payable"] == 450_000
    wht = run_tool(ctx, "tax_compute", {"kind": "wht", "inputs": {
        "gross_amount": 1_000_000, "category": "consultancy", "payee_type": "individual"}}).data
    assert wht["total_wht"] == 50_000
    paye = run_tool(ctx, "tax_compute", {"kind": "paye", "inputs": {"gross_annual": 4_800_000}})
    assert paye.data["total_annual_paye"] == 584_880
    written = run_tool(ctx, "tax_compute", {"kind": "vat", "write": True, "inputs": {
        "standard_rated_sales": 10_000_000, "standard_rated_purchases": 4_000_000}})
    assert written.batch is not None and written.batch.counts()["new_sheets"] == 1


def test_chart_preview_and_native_insert():
    ctx = _ctx()
    out = run_tool(ctx, "add_chart", {
        "title": "Bank flows", "categories": "Bank!A2:A12", "sheet": "Bank",
        "series": [{"name": "Out", "ref": "Bank!C2:C12"}, {"name": "In", "ref": "Bank!D2:D12"}]})
    pv = out.chart_preview
    assert len(pv["rows"]) == 11 and pv["series"][1]["data"][0] == 2_500_000
    new = apply_ops(ledger_bank_xlsx(), out.batch.ops)
    assert len(load_workbook(io.BytesIO(new))["Bank"]._charts) == 1
    with pytest.raises(ToolError):
        run_tool(ctx, "add_chart", {"title": "x", "categories": "Bank!A2:A12",
                                    "series": [{"name": "s", "ref": "Bank!C2:C5"}]})


# --- operation log / apply / undo ---------------------------------------------------------
def test_writes_never_touch_the_file_until_accepted():
    ctx = _ctx()
    original = ledger_bank_xlsx()
    out = run_tool(ctx, "categorise_rows", {})
    assert all(o.old_value is None for o in out.batch.ops)
    assert load_workbook(io.BytesIO(original))["Ledger"]["F1"].value is None
    new = apply_ops(original, out.batch.ops)
    assert load_workbook(io.BytesIO(new))["Ledger"]["F2"].value == "Sale of goods"
    back = apply_ops(new, inverse_ops(out.batch.ops))
    assert load_workbook(io.BytesIO(back))["Ledger"]["F2"].value is None


def _workbench(gate=passing_gate):
    wbench = Workbench(InMemoryBlobStore(), InMemoryConversationStore(), gate=gate)
    conv = wbench.create(client_id=None, client_name="Okonkwo Agro")
    wbench.attach_bytes(conv, ledger_bank_xlsx(), name="ledger.xlsx", document_id=1)
    return wbench, conv


def test_session_accept_reject_undo_and_versions():
    wbench, conv = _workbench()
    ctx = wbench.context(conv, taxonomy=load_taxonomy(), categoriser=scripted_categoriser)
    b1 = wbench.add_batch(conv, run_tool(ctx, "categorise_rows", {}).batch)
    b2 = wbench.add_batch(conv, run_tool(ctx, "build_statement", {"kind": "pnl"}).batch)
    # pending proposals are visible to the next context (overlay), not in the file
    assert "P&L" in wbench.context(conv).workbook("doc-1").sheets
    assert "P&L" not in load_workbook(io.BytesIO(wbench.download(conv, "doc-1"))).sheetnames
    wbench.accept(conv, b1.id)
    assert b1.status == "accepted" and b1.gate["status"] == "passed"
    wbench.accept(conv, b2.id)
    ref = conv.workbook_ref("doc-1")
    assert [v["n"] for v in ref.versions] == [1, 2, 3]
    assert "P&L" in load_workbook(io.BytesIO(wbench.download(conv, "doc-1"))).sheetnames
    inv = wbench.undo(conv, b2.id)
    assert inv.status == "accepted" and b2.status == "undone"
    assert "P&L" not in load_workbook(io.BytesIO(wbench.download(conv, "doc-1"))).sheetnames
    assert load_workbook(io.BytesIO(wbench.download(conv, "doc-1")))["Ledger"]["F2"].value
    with pytest.raises(WorkbenchError):
        wbench.reject(conv, b1.id)
    # state survives the store round-trip
    wbench.store.save(conv)
    again = wbench.store.get(conv.id)
    assert [b.status for b in again.batches] == ["accepted", "undone", "accepted"]


def test_gate_block_keeps_the_previous_version():
    wbench, conv = _workbench(gate=blocking_gate)
    ctx = wbench.context(conv, taxonomy=load_taxonomy(), categoriser=scripted_categoriser)
    b = wbench.add_batch(conv, run_tool(ctx, "categorise_rows", {}).batch)
    wbench.accept(conv, b.id)
    assert b.status == "blocked" and b.gate["errors"] == ["P&L!C9: #REF!"]
    assert len(conv.workbook_ref("doc-1").versions) == 1


def test_conflict_when_the_cell_changed_after_the_proposal():
    wbench, conv = _workbench()
    ctx = wbench.context(conv, taxonomy=load_taxonomy(), categoriser=scripted_categoriser)
    b1 = wbench.add_batch(conv, run_tool(ctx, "categorise_rows", {}).batch)
    # second proposal overwrites the category cells proposed by the first
    ctx2 = wbench.context(conv, taxonomy=load_taxonomy(), categoriser=scripted_categoriser)
    b2 = wbench.add_batch(conv, run_tool(ctx2, "categorise_rows",
                                         {"only_blank": False}).batch)
    assert b2.counts()["changed_cells"] > 0
    wbench.reject(conv, b1.id)
    wbench.accept(conv, b2.id)
    assert b2.status == "blocked" and b2.gate["status"] == "conflict"


def test_accept_with_reviewer_edit_and_new_workbook():
    wbench, conv = _workbench()
    ctx = wbench.context(conv, taxonomy=load_taxonomy(), categoriser=scripted_categoriser)
    b = wbench.add_batch(conv, run_tool(ctx, "categorise_rows", {}).batch)
    wbench.accept(conv, b.id, edits={1: {"new_value": "Rendering of services"}})
    assert load_workbook(io.BytesIO(wbench.download(conv, "doc-1")))["Ledger"]["F2"].value \
        == "Rendering of services"
    ctx = wbench.context(conv, taxonomy=load_taxonomy())
    nb = wbench.add_batch(conv, run_tool(ctx, "create_workbook", {
        "name": "CIT template", "sheets": [{"name": "Sheet1", "headers": ["Item", "Amount"],
                                            "rows": [["Profit", 100], ["Tax", "=B2*0.3"]]}]}
    ).batch)
    wbench.accept(conv, nb.id)
    new_id = nb.ops[0].workbook_id
    wb = load_workbook(io.BytesIO(wbench.download(conv, new_id)))
    assert wb.sheetnames == ["Sheet1"] and wb["Sheet1"]["B3"].value == "=B2*0.3"
    with pytest.raises(WorkbenchError):
        wbench.accept(conv, b.id)

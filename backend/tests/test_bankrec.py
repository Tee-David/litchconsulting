"""Bank rec at balance level across files (plan v5 slice E). The GTBank figures are
the Ebube answer key; Zenith's case (charges not posted) is rebuilt here."""
from __future__ import annotations

import io

from openpyxl import Workbook as XlWorkbook

from litchai.evals.workbench import passing_gate
from litchai.workbench.session import InMemoryBlobStore, InMemoryConversationStore, Workbench
from litchai.workbench.tools import run_tool


def _x(sheets):
    wb = XlWorkbook()
    wb.remove(wb.active)
    for title, rows in sheets.items():
        ws = wb.create_sheet(title)
        for r in rows:
            ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


BOOKS = _x({
    "Trial balance": [["Account code", "Account name", "Debit", "Credit"],
                      ["1300", "GTBank current account", 37_792_828.81, None],
                      ["1310", "Zenith Bank current account", 103_361_652.89, None],
                      ["3000", "Share capital", None, 141_154_481.70]],
    "Cheque register": [["Cheque no", "Date written", "Payee", "Detail", "Amount"],
                        ["000231", "2025-12-29", "Coolserve Refrigeration Ltd", "Repair", 1_200_000]]})
GTB = _x({"Statement": [["Trans Date", "Narration", "Reference", "Debit", "Credit", "Balance"],
                        ["2025-12-01", "OPENING BALANCE", None, None, None, 40_000_000],
                        ["2025-12-10", "SCHOOL FEES - DIRECTOR", None, 1_007_171.19, None, 38_992_828.81]]})
ZEN = _x({"Statement": [["Trans Date", "Narration", "Reference", "Debit", "Credit", "Balance"],
                        ["2025-12-01", "OPENING BALANCE", None, None, None, 103_361_652.89],
                        ["2025-12-31", "COT CHARGE DEC", None, 150_000.00, None, 103_211_652.89],
                        ["2025-12-31", "SMS ALERT FEE", None, 44_374.88, None, 103_167_278.01]]})


def _job(statement, name):
    w = Workbench(InMemoryBlobStore(), InMemoryConversationStore(), gate=passing_gate)
    conv = w.create(client_id=None, client_name="Ebube", period_label="FY2025")
    w.attach_bytes(conv, BOOKS, name="Ebube_Books.xlsx", document_id=1)
    w.attach_bytes(conv, statement, name=name, document_id=2)
    return w, conv


def test_unpresented_cheque_explains_gtbank():
    w, conv = _job(GTB, "GTBank_Statement_FY2025.xlsx")
    out = run_tool(w.context(conv), "bank_rec", {"statement": "GTBank"})
    d = out.data
    assert d["reconciled"] and d["unpresented_cheques"][0]["no"] == "000231"
    assert d["charges_on_statement"] == 0  # school fees are not a bank charge
    w.add_batch(conv, out.batch)
    assert w.accept(conv, out.batch.id).status == "accepted"


def test_charges_not_posted_explain_zenith():
    w, conv = _job(ZEN, "Zenith_Statement_FY2025.xlsx")
    d = run_tool(w.context(conv), "bank_rec", {"statement": "Zenith", "write": False}).data
    assert d["charges_not_posted"] and d["charges_on_statement"] == 194_374.88
    assert d["adjusted_ledger"] == 103_167_278.01 and d["reconciled"]

"""Files as job context: labels without a model, the agent's one-line manifest,
the person's note, and read_document."""
from __future__ import annotations

import io

from openpyxl import Workbook as XlWorkbook

from litchai.evals.workbench import passing_gate
from litchai.workbench.file_context import describe, manifest
from litchai.workbench.model import load_xlsx
from litchai.workbench.session import InMemoryBlobStore, InMemoryConversationStore, Workbench
from litchai.workbench.tools import run_tool


def _xlsx(rows, title="Sheet1"):
    wb = XlWorkbook()
    ws = wb.active
    ws.title = title
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


STATEMENT = _xlsx([["Date", "Narration", "Debit", "Credit", "Balance"],
                   *[[f"2025-0{m}-01", "POS settlement", None, 1000.0 * m, 5000.0 + m]
                     for m in range(1, 7)]])
LETTER = _xlsx([["Zenith Bank Plc. Offer of a term loan facility to Ebube Foods Ltd."],
                ["Amount: NGN 60,000,000. Interest: 24% a year, charged at 2% a month."],
                ["Repayment: NGN 2,500,000 principal a month plus interest, from 3 April 2025."],
                ["Security: an all-asset debenture and the director's personal guarantee."]],
               "Notes")


def _wb():
    w = Workbench(InMemoryBlobStore(), InMemoryConversationStore(), gate=passing_gate)
    conv = w.create(client_id=None, client_name="Ebube", period_label="FY2025")
    w.attach_bytes(conv, STATEMENT, name="GTBank_Statement_FY2025.xlsx", document_id=1)
    w.attach_bytes(conv, LETTER, name="Zenith_Loan_Offer_Letter.xlsx", document_id=2)
    return w, conv


def test_files_are_labelled_with_no_model():
    s = describe(load_xlsx(STATEMENT, wb_id="a", name="GTBank_Statement_FY2025.xlsx"))
    assert s["role"] == "bank_statement" and s["bank"] == "GTBank" and s["rows"] == 6
    d = describe(load_xlsx(LETTER, wb_id="b", name="Zenith_Loan_Offer_Letter.xlsx"))
    assert d["role"] == "document"


def test_manifest_has_one_line_per_file_with_the_note():
    w, conv = _wb()
    conv.workbooks[0].note = "use for the bank rec"
    conv.workbooks[1].group = "ebube.zip"
    text = manifest(conv.workbooks, w.models(conv))
    lines = text.splitlines()
    assert len(lines) == 2
    assert "bank statement (GTBank)" in lines[0] and "use: use for the bank rec" in lines[0]
    assert "letter, contract or notes" in lines[1] and "from ebube.zip" in lines[1]


def test_read_document_gives_the_letter_text():
    w, conv = _wb()
    ctx = w.context(conv)
    d = run_tool(ctx, "read_document", {"workbook": "Zenith_Loan_Offer_Letter.xlsx"}).data
    assert "2% a month" in d["text"] and not d["truncated"]

"""Workbench v8 limits: formatting accepted by itself (switch), macros read and never run."""
from __future__ import annotations

from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy, _workbench
from litchai.workbench import formats as F
from litchai.workbench.macros import read_macros_tool, summary_line
from litchai.workbench.tools import run_tool

MACROS = {"modules": [{"name": "Module1", "lines": 12, "code": "Sub Auto_Open()\n Shell \"cmd\"\nEnd Sub",
                       "truncated": False}],
          "warnings": [{"kind": "AutoExec", "keyword": "Auto_Open", "what": "runs by itself", "detail": ""},
                       {"kind": "Suspicious", "keyword": "Shell", "what": "does something risky", "detail": ""}],
          "risky": True}


def _ctx(wb, conv):
    return wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)


def test_formatting_is_accepted_by_itself_only_when_switched_on():
    wb, conv = _workbench({"fixture": "qa_tb", "kind": "work"})
    style = {"sheet": "Trial balance", "cells": [{"cell": "A1", "style": {"b": True}}]}
    out = run_tool(_ctx(wb, conv), "write_cells", style)
    wb.add_batch(conv, out.batch)
    assert out.batch.status == "pending"  # off by default

    conv.auto_format = True
    out = run_tool(_ctx(wb, conv), "write_cells", style | {"cells": [{"cell": "B1", "style": {"i": True}}]})
    wb.add_batch(conv, out.batch)
    assert out.batch.status == "accepted" and "formatting only" in out.batch.summary

    out = run_tool(_ctx(wb, conv), "write_cells", {"sheet": "Trial balance", "cells": [{"cell": "Z1", "value": 5}]})
    wb.add_batch(conv, out.batch)
    assert out.batch.status == "pending"  # a figure always waits


def test_macros_are_summarised_and_read_never_run(monkeypatch):
    assert "never runs them" in summary_line(MACROS) and "Shell" in summary_line(MACROS)
    monkeypatch.setattr("litchai.workbench.macros.read_vba", lambda data, name: MACROS)
    wb, conv = _workbench({"fixture": "qa_tb"})
    src = conv.workbooks[0]
    copy = F.Converted(b"", "xlsx", converted=False, macros=F._macros(b"x", "book.xlsm", ".xlsm"))
    assert copy.source("book.xlsm")["macros"]["risky"] is True
    src.source = copy.source("book.xlsm")
    out = read_macros_tool(_ctx(wb, conv), conv.workbooks)
    assert "Sub Auto_Open" in out.summary and "not run" in out.summary
    assert out.data["files"][0]["workbook_id"] == src.id


def test_cbn_rates_are_kept_and_read_by_date(tmp_path, monkeypatch):
    from datetime import date

    from litchai import fx_rates

    feed = [{"currency": "US DOLLAR", "ratedate": "2025-12-30", "buyingrate": "1530.1",
             "centralrate": "1531.0", "sellingrate": "1531.9"},
            {"currency": "US DOLLAR", "ratedate": "2025-12-31", "buyingrate": "1535.1",
             "centralrate": "1536.0", "sellingrate": "1536.9"},
            {"currency": "POUNDS STERLING", "ratedate": "2025-12-31", "buyingrate": "2050",
             "centralrate": "2051", "sellingrate": "2052"}]
    path = tmp_path / "fx" / "cbn.json"
    assert fx_rates.refresh(lambda: feed, path)["currencies"] == 2
    data = fx_rates.load(path)
    assert fx_rates.rate_on("USD", date(2025, 12, 31), data=data) == (1536.0, "2025-12-31")
    assert fx_rates.rate_on("USD", date(2026, 1, 1), "selling", data) == (1536.9, "2025-12-31")
    assert fx_rates.rate_on("GBP", date(2025, 12, 31), data=data)[0] == 2051.0
    assert fx_rates.rate_on("USD", date(2025, 1, 1), data=data) is None

    monkeypatch.setattr(fx_rates, "_path", lambda: path)
    out = fx_rates.fx_rates_tool(None, currency="usd", on="2025-12-31")
    assert out.data["rate"] == 1536.0 and "CBN" in out.summary and out.data["rate_date"] == "2025-12-31"


def test_scan_checks_find_misread_figures():
    from datetime import date

    from litchai.evals.cases.common import xlsx
    from litchai.evals.workbench import passing_gate
    from litchai.workbench.scan_checks import scan_checks
    from litchai.workbench.session import InMemoryBlobStore, InMemoryConversationStore, Workbench

    rows = [["Date", "Description", "Money in", "Money out", "Balance", "Page"],
            [date(2026, 1, 2), "Opening", None, None, 100000, 1],
            [date(2026, 1, 3), "POS Ikeja", 1500, None, 101500, 1],
            [date(2026, 1, 4), "POS Ikeja", 150000, None, 251500, 1],   # shifted decimal
            [date(2026, 1, 5), "Charges", None, 300, 252000, 1],        # balance break (misread)
            [date(2025, 11, 1), "Transfer", 2000, None, 254000, 2],     # date jumps back
            [date(2026, 1, 7), "~|~ ¦¦ __ ||", None, None, 254000, 2]]  # unreadable
    wb = Workbench(InMemoryBlobStore(), InMemoryConversationStore(), gate=passing_gate)
    conv = wb.create(client_id=None)
    wb.attach_bytes(conv, xlsx({"Transactions": rows}), name="statement.pdf", document_id=1)
    out = scan_checks(wb.context(conv), {"statement.pdf"})
    kinds = {f["check"] for f in out.data["findings"]}
    assert {"balance_break", "shifted_decimal", "unreadable_rows", "dates_out_of_order"} <= kinds
    brk = next(f for f in out.data["findings"] if f["check"] == "balance_break")
    assert "row 5, page 1" in brk["what"] and "251,200.00 expected" in brk["what"]

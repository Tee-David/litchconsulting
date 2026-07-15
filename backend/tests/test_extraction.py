"""Excel extraction + sandbox + balance-continuity + dedup (Phase 2b)."""
import io
import zipfile
from datetime import date
from decimal import Decimal

import pytest

from litchai.extraction import engine_for, registered_engines
from litchai.extraction.balance import check_continuity
from litchai.extraction.dedup import (
    Coverage,
    DupTxn,
    detect_statement_overlap,
    duplicate_suspect_indices,
)
from litchai.extraction.excel import ExcelEngine
from litchai.extraction.sandbox import SandboxRejected, check_zip_safety, sniff_mime
from litchai.fixtures_gen import generate_statement, workbook_bytes

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _statement_bytes(seed=1, **kw):
    return workbook_bytes(generate_statement(seed=seed, **kw))


# --- registry + engine selection ------------------------------------------


def test_registry_has_excel_and_docling():
    assert "excel" in registered_engines()
    assert "docling_text" in registered_engines()
    assert "docling_ocr" in registered_engines()


def test_engine_for_picks_excel_on_xlsx():
    assert engine_for(XLSX_MIME, "statement.xlsx").name == "excel"


# --- Excel extraction ------------------------------------------------------


def test_excel_extracts_bank_statement_with_provenance():
    result = ExcelEngine().extract(_statement_bytes(seed=1))
    statement = generate_statement(seed=1)

    assert result.sheet_type == "bank_statement"
    assert len(result.rows) == len(statement.rows)
    assert result.opening_balance == Decimal(str(round(statement.opening_balance, 2)))
    # provenance points back to the source cell
    assert result.rows[0].sheet_ref.startswith("Transactions!")
    assert result.rows[0].row_ref is not None


def test_excel_signs_amounts_credit_positive_debit_negative():
    result = ExcelEngine().extract(_statement_bytes(seed=2))
    statement = generate_statement(seed=2)
    for extracted, source in zip(result.rows, statement.rows):
        expected = Decimal(str(source.money_in)) - Decimal(str(source.money_out))
        assert extracted.amount == expected.quantize(Decimal("0.01"))


def test_excel_rejects_headerless_sheet():
    from openpyxl import Workbook

    wb = Workbook()
    wb.active.append(["hello", "world"])
    buf = io.BytesIO()
    wb.save(buf)
    from litchai.extraction.base import ExtractionError

    with pytest.raises(ExtractionError):
        ExcelEngine().extract(buf.getvalue())


# --- balance continuity ----------------------------------------------------


def test_clean_statement_is_continuous():
    result = ExcelEngine().extract(_statement_bytes(seed=3))
    report = check_continuity(result)
    assert report.checked is True
    assert report.ok is True
    assert report.breaks == []


def test_continuity_localizes_a_single_error():
    result = ExcelEngine().extract(_statement_bytes(seed=4))
    # corrupt one printed balance mid-statement
    rows = list(result.rows)
    bad_idx = next(i for i, r in enumerate(rows) if r.balance is not None and i > 2)
    rows[bad_idx] = type(rows[bad_idx])(
        **{**rows[bad_idx].__dict__, "balance": rows[bad_idx].balance + Decimal("999.99")}
    )
    from dataclasses import replace

    corrupted = replace(result, rows=rows)
    report = check_continuity(corrupted)
    assert report.ok is False
    assert [b.row_index for b in report.breaks] == [bad_idx]
    assert report.breaks[0].delta == Decimal("999.99")


# --- sandbox ---------------------------------------------------------------


def test_zip_bomb_rejected():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("bomb.bin", b"\x00" * (5 * 1024 * 1024))  # 5MB of zeros -> huge ratio
    with pytest.raises(SandboxRejected):
        check_zip_safety(buf.getvalue())


def test_non_zip_rejected_by_sandbox():
    with pytest.raises(SandboxRejected):
        check_zip_safety(b"%PDF-1.7 not a zip")


def test_valid_xlsx_passes_sandbox():
    check_zip_safety(_statement_bytes())  # no raise


def test_sniff_mime_catches_disguised_file():
    assert sniff_mime(b"MZ\x90\x00 fake pdf", "application/pdf") == "application/pdf"  # trusts declared for unknown
    assert sniff_mime(b"%PDF-1.7", "text/csv") == "application/pdf"


# --- dedup + overlap -------------------------------------------------------


def test_duplicate_suspects_flagged_not_dropped():
    txns = [
        DupTxn(0, "1234567890", date(2026, 1, 5), Decimal("5000.00"), "TRF TO SHOPRITE REF 111"),
        DupTxn(1, "1234567890", date(2026, 1, 5), Decimal("5000.00"), "TRF TO SHOPRITE REF 222"),
        DupTxn(2, "1234567890", date(2026, 1, 6), Decimal("5000.00"), "TRF TO SHOPRITE REF 333"),
    ]
    # rows 0 and 1 collapse to the same normalized key (refs stripped, same date+amount)
    assert duplicate_suspect_indices(txns) == {1}


def test_statement_overlap_detected_per_account():
    covs = [
        Coverage(1, "ACC-A", date(2026, 1, 1), date(2026, 3, 31)),
        Coverage(2, "ACC-A", date(2026, 3, 1), date(2026, 5, 31)),   # overlaps doc 1 in March
        Coverage(3, "ACC-B", date(2026, 1, 1), date(2026, 12, 31)),  # different account
    ]
    overlaps = detect_statement_overlap(covs)
    assert len(overlaps) == 1
    assert (overlaps[0].a, overlaps[0].b) == (1, 2)
    assert overlaps[0].start == date(2026, 3, 1)
    assert overlaps[0].end == date(2026, 3, 31)

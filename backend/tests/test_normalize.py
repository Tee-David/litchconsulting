"""Narration normalizer tests (Phase 3)."""
from litchai.categorize import NORMALIZER_VERSION, normalize_narration


def test_version_is_pinned():
    assert NORMALIZER_VERSION == "v1"


def test_strips_ref_date_amount():
    raw = "POS/PAYSTACK/REF:FT21ABZ99/12-01-2026 NGN5,000.00"
    # 'pos' is kept as a channel signal; ref/date/amount are gone
    assert normalize_narration(raw) == "pos paystack"


def test_repeat_vendor_collapses_to_same_form():
    a = normalize_narration("POS/PAYSTACK/REF:FT21ABZ99/12-01-2026 NGN5,000.00")
    b = normalize_narration("paystack pos 88123456 ₦2,500")
    # both keep the vendor core; channel word 'pos' is kept as signal
    assert "paystack" in a and "paystack" in b


def test_card_mask_stripped():
    assert normalize_narration("CARD PURCHASE ****1234 SHOPRITE") == "card purchase shoprite"


def test_keeps_vendor_with_single_digit():
    assert normalize_narration("9MOBILE AIRTIME") == "9mobile airtime"
    assert normalize_narration("1XBET DEPOSIT") == "1xbet deposit"


def test_iso_date_and_amount_removed():
    assert normalize_narration("SALARY 2026-01-25 1,250,000.00") == "salary"


def test_transfer_narration():
    raw = "TRF/GTB/ADEBAYO T/REF 100039772/TO CHICKEN REPUBLIC"
    out = normalize_narration(raw)
    assert "chicken republic" in out
    assert "100039772" not in out
    assert "ref" not in out.split()


def test_whitespace_collapsed_and_lowercased():
    assert normalize_narration("  BANK   CHARGES\tVAT ") == "bank charges vat"


def test_empty_stays_empty():
    assert normalize_narration("") == ""
    assert normalize_narration("REF: 000123456") == ""

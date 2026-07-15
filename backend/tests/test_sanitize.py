"""Amount sanitization tests (Phase 2b, FR3)."""
from decimal import Decimal

import pytest

from litchai.sanitize import parse_amount


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("1,234.56", "1234.56"),
        ("₦1,234.56", "1234.56"),
        ("N1,234.56", "1234.56"),
        ("NGN 1,234.56", "1234.56"),
        ("50,000.00", "50000.00"),
        ("1234.5", "1234.50"),
        ("(1,234.56)", "-1234.56"),
        ("-1,234.56", "-1234.56"),
        ("1,234.56 DR", "-1234.56"),
        ("1,234.56CR", "1234.56"),
        ("  2,000  ", "2000.00"),
        (1500, "1500.00"),
        (52.5, "52.50"),
    ],
)
def test_parse_amount_values(raw, expected):
    parsed = parse_amount(raw)
    assert parsed is not None
    assert parsed.value == Decimal(expected)


@pytest.mark.parametrize("raw", ["", "-", "—", None])
def test_empty_cells_are_none(raw):
    assert parse_amount(raw) is None


def test_markers_captured():
    assert parse_amount("1,000.00 CR").marker == "cr"
    assert parse_amount("1,000.00 DR").marker == "dr"
    assert parse_amount("1,000.00").marker is None


def test_two_decimals_enforced():
    assert parse_amount("10").value == Decimal("10.00")
    assert parse_amount("10.005").value == Decimal("10.01")  # half-up


def test_european_separator_is_flagged_not_silently_wrong():
    parsed = parse_amount("1.234,56")
    assert "ambiguous_separator" in parsed.flags
    assert parsed.value == Decimal("1234.56")


def test_ambiguous_single_comma_decimal_flagged():
    parsed = parse_amount("1234,56")
    assert "ambiguous_separator" in parsed.flags
    assert parsed.value == Decimal("1234.56")


def test_thousands_comma_not_flagged():
    parsed = parse_amount("1,234")
    assert parsed.flags == ()
    assert parsed.value == Decimal("1234.00")


def test_unparseable_junk_is_flagged_zero():
    parsed = parse_amount("abc")
    assert parsed is not None
    assert "unparseable" in parsed.flags
    assert parsed.value == Decimal("0.00")

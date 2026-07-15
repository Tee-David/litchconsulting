"""Amount / locale sanitization (FR3, Phase 2b).

Turns the messy numeric strings a bank statement or spreadsheet yields into a
signed 2dp :class:`~decimal.Decimal`, **flagging** ambiguous cases rather than
silently guessing (FR3). Nigerian convention is US/UK-style: comma thousands,
dot decimal (``1,234.56``); negatives appear as parentheses, a leading minus, or
a trailing ``DR``; credits as a trailing ``CR``.

Pure-Python and deterministic — no pandas. The bulk path on the VM can still fan
these through pandas, but the parsing rule lives here, once, and is unit-tested.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

TWO_DP = Decimal("0.01")

# Currency noise stripped before parsing: Naira sign, N/NGN prefixes, spaces
# (incl. non-breaking / narrow spaces OCR loves to emit).
_CURRENCY = re.compile(r"(?i)(?:ngn|₦)")
_SPACE = re.compile(r"[\s   ]")
_MARKER = re.compile(r"(?i)(cr|dr)\.?$")  # trailing bank marker, with or without a space
_NUMERIC = re.compile(r"^[+-]?\d+(\.\d+)?$")


@dataclass(frozen=True)
class AmountParse:
    value: Decimal              # signed, quantized to 2dp
    marker: str | None = None   # 'cr' | 'dr' from a trailing bank marker
    flags: tuple[str, ...] = field(default_factory=tuple)


def parse_amount(raw: str | int | float | None) -> AmountParse | None:
    """Parse one amount cell. Returns ``None`` for a genuinely empty cell (``""``,
    ``"-"``, ``None``); raises nothing — unparseable junk comes back flagged."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return AmountParse(value=_q(Decimal(str(raw))))

    text = raw.strip()
    if text in {"", "-", "—", "–"}:
        return None

    flags: list[str] = []
    negative = False

    # Parentheses = negative (accounting style), possibly with a leading currency.
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1].strip()

    # Trailing CR/DR marker.
    marker: str | None = None
    m = _MARKER.search(text)
    if m:
        marker = m.group(1).lower()
        if marker == "dr":
            negative = True
        text = text[: m.start()].strip()

    text = _CURRENCY.sub("", text)
    # A bare leading "N" currency prefix (e.g. "N1,234.56"), but not a sign.
    text = re.sub(r"(?i)^n(?=[\d(])", "", text).strip()
    text = _SPACE.sub("", text)

    if text.startswith("-"):
        negative = True
        text = text[1:]
    elif text.startswith("+"):
        text = text[1:]

    cleaned, sep_flags = _strip_grouping(text)
    flags.extend(sep_flags)

    if not _NUMERIC.match(cleaned):
        return AmountParse(value=Decimal("0.00"), marker=marker, flags=("unparseable", *flags))

    try:
        value = _q(Decimal(cleaned))
    except InvalidOperation:
        return AmountParse(value=Decimal("0.00"), marker=marker, flags=("unparseable", *flags))

    if negative:
        value = -value
    return AmountParse(value=value, marker=marker, flags=tuple(flags))


def _strip_grouping(text: str) -> tuple[str, list[str]]:
    """Remove thousands separators, assuming comma-thousands/dot-decimal. Flags
    (never silently rewrites) a European-looking ``1.234,56`` as ambiguous."""
    flags: list[str] = []
    has_comma, has_dot = "," in text, "." in text

    if has_comma and has_dot:
        if text.rfind(",") > text.rfind("."):
            # comma is the last separator -> looks European; flag, keep NGN reading
            flags.append("ambiguous_separator")
            return text.replace(".", "").replace(",", "."), flags
        return text.replace(",", ""), flags

    if has_comma and not has_dot:
        # Single trailing group of exactly 2 digits could be a decimal comma.
        if re.search(r",\d{2}$", text) and not re.search(r",\d{3}", text):
            flags.append("ambiguous_separator")
            return text.replace(",", "."), flags
        return text.replace(",", ""), flags

    return text, flags


def _q(value: Decimal) -> Decimal:
    return value.quantize(TWO_DP, rounding=ROUND_HALF_UP)

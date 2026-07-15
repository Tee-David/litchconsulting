"""Narration normalization (Phase 3) — the ONE canonical form.

A single versioned function feeds every rung: normalized-exact match, pg_trgm
trigram, and pgvector embeddings. Because it is versioned, ``category_memory``
rows record the ``normalizer_version`` they were built under and are only
re-embedded when this function's version (or the embedding model) changes — not
on every run.

The rules keep the merchant/purpose core of a bank narration and strip the parts
that vary transaction-to-transaction (refs, dates, amounts, card masks, punctu-
ation, casing), so ``"POS/PAYSTACK/REF:FT21ABZ99/12-01-2026 NGN5,000.00"`` and
``"paystack pos 88123 ₦2,500"`` both collapse to ``"paystack pos"``.

Embedding prefixes (``search_document:`` / ``search_query:``) are the embedder's
concern (:mod:`litchai.embeddings`), applied on top of this canonical string —
never baked in here, so the same normalized text drives exact/trigram too.
"""
from __future__ import annotations

import re

NORMALIZER_VERSION = "v1"

_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec"

# Dates: 12/01/2026, 2026-01-12, 12-jan-26, jan 12, 12jan.
_DATE = re.compile(
    rf"""(?ix)
    \b(
        \d{{1,4}}[/-]\d{{1,2}}[/-]\d{{1,4}}          # 12/01/2026 or 2026-01-12
      | \d{{1,2}}[\s-]?(?:{_MONTHS})[a-z]*(?:[\s-]?\d{{2,4}})?  # 12 jan 2026 / 12jan
      | (?:{_MONTHS})[a-z]*[\s-]?\d{{1,2}}(?:[\s,-]?\d{{2,4}})? # jan 12 / jan 12, 2026
    )\b
    """,
)

# Currency then amounts (comma-grouped, optional decimals).
_CURRENCY = re.compile(r"(?i)(?:ngn|₦)")
_AMOUNT = re.compile(r"(?<![a-z0-9])n?\d[\d,]*(?:\.\d+)?(?![a-z0-9])", re.I)

# Mixed alphanumeric codes (a letter AND at least TWO digits, len>=6): txn ids
# like ft21abz99, session/mobile refs. Vendor names with one digit — "9mobile",
# "1xbet" — keep their digit and survive.
_ALNUM_REF = re.compile(r"(?i)\b(?=[a-z0-9]*[a-z])(?=(?:[a-z]*\d){2})[a-z0-9]{6,}\b")

# Pure digit runs of 4+ (account numbers, txn ids, card masks after *-strip).
_LONG_DIGITS = re.compile(r"\b\d{4,}\b")

_PUNCT = re.compile(r"[^a-z0-9]+")

# Bank-noise label tokens left behind once their ids are stripped. Channel words
# (pos / web / mobile / ussd) are kept — they carry categorization signal.
_NOISE = {"ref", "reff", "trn", "txn", "trans", "rrn", "tid", "stan"}


def normalize_narration(raw: str) -> str:
    text = raw.lower()
    text = _DATE.sub(" ", text)
    text = _CURRENCY.sub(" ", text)
    text = text.replace("*", " ")          # card masks ****1234 -> 1234 -> stripped below
    text = _AMOUNT.sub(" ", text)
    text = _ALNUM_REF.sub(" ", text)
    text = _LONG_DIGITS.sub(" ", text)
    text = _PUNCT.sub(" ", text)
    tokens = [t for t in text.split() if t not in _NOISE]
    return " ".join(tokens)

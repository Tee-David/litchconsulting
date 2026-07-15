"""Pluggable extraction engines (Phase 2b).

An engine turns raw document bytes into an :class:`ExtractionResult` — statement
metadata plus rows with source provenance (``page_ref`` for PDFs, ``sheet_ref``/
``row_ref`` for spreadsheets). The pipeline picks one via the registry, so the
Excel path, the Docling text/OCR paths, and any future cloud engine are a config
choice, not a rewrite (PRD decision 12). Rows carry a **signed** amount (credit
positive, debit negative); the balance column, when present, drives the
Phase 2b balance-continuity gate.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Protocol, runtime_checkable


class ExtractionError(RuntimeError):
    pass


@dataclass(frozen=True)
class ExtractedRow:
    raw_text: str
    amount: Decimal                    # signed: credit (money in) +, debit (out) -
    balance: Decimal | None = None     # running balance after the row, if the source has one
    txn_date: date | None = None
    page_ref: int | None = None
    sheet_ref: str | None = None       # e.g. "Transactions!A14"
    row_ref: int | None = None
    flags: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ExtractionResult:
    engine: str
    rows: list[ExtractedRow]
    account_label: str | None = None
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None
    period_start: date | None = None
    period_end: date | None = None
    sheet_type: str | None = None      # excel classification: 'bank_statement' | 'ledger' | ...
    flags: tuple[str, ...] = field(default_factory=tuple)


@runtime_checkable
class ExtractionEngine(Protocol):
    name: str

    def can_handle(self, mime: str, filename: str) -> bool: ...

    def extract(self, data: bytes, *, page_range: tuple[int, int] | None = None) -> ExtractionResult: ...


# --- registry --------------------------------------------------------------

_REGISTRY: dict[str, ExtractionEngine] = {}


def register_engine(engine: ExtractionEngine) -> ExtractionEngine:
    _REGISTRY[engine.name] = engine
    return engine


def get_engine(name: str) -> ExtractionEngine:
    try:
        return _REGISTRY[name]
    except KeyError:
        raise ExtractionError(f"no extraction engine named {name!r}") from None


def registered_engines() -> tuple[str, ...]:
    return tuple(_REGISTRY)


def engine_for(mime: str, filename: str) -> ExtractionEngine:
    """First registered engine that accepts the document. Registration order is
    priority order (Excel/text before the expensive OCR path)."""
    for engine in _REGISTRY.values():
        if engine.can_handle(mime, filename):
            return engine
    raise ExtractionError(f"no extraction engine handles {mime!r} ({filename!r})")

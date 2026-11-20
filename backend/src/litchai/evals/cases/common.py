"""Shared builders for the edge cases: workbooks, rounding and a balanced TB."""
from __future__ import annotations

import io
from datetime import datetime
from typing import Any

from openpyxl import Workbook


def r2(x: float) -> float:
    return round(x + 1e-9, 2)


def xlsx(sheets: dict[str, list[list[Any]]]) -> bytes:
    wb = Workbook()
    wb.properties.created = wb.properties.modified = datetime(2026, 1, 5, 9, 0)
    wb.remove(wb.active)
    for name, data in sheets.items():
        ws = wb.create_sheet(name)
        for row in data:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def balance_tb(tb: list[tuple[str, str, float, float]]) -> list[tuple[str, str, float, float]]:
    """Add retained earnings so debits equal credits."""
    dr, cr = sum(x[2] for x in tb), sum(x[3] for x in tb)
    return [*tb, ("3100", "Retained earnings", 0.0, r2(dr - cr)) if dr > cr else
            ("3100", "Retained earnings", r2(cr - dr), 0.0)]

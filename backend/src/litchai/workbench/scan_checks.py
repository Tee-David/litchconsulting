"""Checks for misread scans (v8, limit 2.1).

OCR gives no reliable confidence per figure, so the figures are tested against each
other. Each finding names the row (and the page of the scan) to compare by eye:

- the running balance: previous balance + money in - money out must equal the
  balance read; a break means one of those figures was misread;
- a shifted decimal: the same description with an amount exactly 10, 100 or 1,000
  times another one;
- unreadable rows: no amount at all, or a description that is mostly OCR junk;
- dates out of order on a statement (more than 31 days back from the row above).

Read only. Runs on sheets that came from a PDF or a scan (a Page column, or a file
whose source format is pdf, png or jpg).
"""
from __future__ import annotations

import re
from typing import Any

from litchai.workbench.context import ToolContext, ToolOutput
from litchai.workbench.model import a1
from litchai.workbench.sector_checks import Tab, as_date, m, tabs

_JUNK = re.compile(r"[|~¦§¤°ãâ€™�_=]{1}")


def _scanned(t: Tab, scanned_files: set[str]) -> bool:
    return t.file in scanned_files or t.col(r"^page$") is not None


def scan_checks(ctx: ToolContext, scanned_files: set[str] | None = None) -> ToolOutput:
    scanned_files = scanned_files or set()
    findings: list[dict[str, Any]] = []
    cites: list[str] = []
    for t in tabs(ctx):
        if not _scanned(t, scanned_files):
            continue
        d_c, desc_c = t.col(r"^date|value date|txn date"), t.col(r"description|narration|details|particulars")
        in_c = t.col(r"money in|credit|deposit|lodgement|^in$")
        out_c = t.col(r"money out|debit|withdrawal|payment|^out$")
        bal_c = t.col(r"balance")
        page_c = t.col(r"^page$")
        rows = list(t.rows())
        where = lambda r: (f"row {r}" + (f", page {t.text(r, page_c)}" if page_c and t.text(r, page_c) else ""))  # noqa: E731
        sheet = t.sheet.name
        # 1. running balance
        if bal_c and (in_c or out_c):
            breaks = []
            for prev, r in zip(rows, rows[1:]):
                pb, b = t.val(prev, bal_c), t.val(r, bal_c)
                if pb in (None, "") or b in (None, ""):
                    continue
                want = t.num(prev, bal_c) + t.num(r, in_c) - t.num(r, out_c)
                if abs(want - t.num(r, bal_c)) > 0.5:
                    breaks.append((r, want, t.num(r, bal_c)))
            for r, want, got in breaks[:5]:
                cites.append(f"'{sheet}'!{a1(r, bal_c)}")
                findings.append({"check": "balance_break", "amount": round(abs(want - got), 2),
                                 "what": f"{t.file}, {where(r)}: the balance does not follow from the row "
                                         f"above ({m(want)} expected, {m(got)} read)",
                                 "fix": "Compare this row with the scan: the amount or the balance was "
                                        "probably misread.", "source": f"{sheet}!{a1(r, bal_c)}"})
        # 2. shifted decimal
        if desc_c and (in_c or out_c):
            seen: dict[str, list[tuple[int, float]]] = {}
            for r in rows:
                amt = t.num(r, in_c) or t.num(r, out_c)
                key = re.sub(r"\d+", "", t.text(r, desc_c).lower()).strip()[:40]
                if amt and key:
                    seen.setdefault(key, []).append((r, amt))
            shifted = []
            for items in seen.values():
                for r1, a in items:
                    for r2, b in items:
                        if r1 != r2 and b and any(abs(a - b * f) < 0.01 for f in (10, 100, 1000)):
                            shifted.append((r1, a, b))
            for r, a, b in shifted[:3]:
                findings.append({"check": "shifted_decimal", "amount": round(a - b, 2),
                                 "what": f"{t.file}, {where(r)}: {m(a)} is exactly 10, 100 or 1,000 "
                                         f"times a similar line ({m(b)})",
                                 "fix": "Check the decimal point against the scan.",
                                 "source": f"{sheet}!row {r}"})
        # 3. unreadable rows
        bad = []
        for r in rows:
            text = t.text(r, desc_c) if desc_c else ""
            no_amount = (in_c or out_c) and not (t.num(r, in_c) or t.num(r, out_c))
            junk = len(text) >= 6 and len(_JUNK.findall(text)) / len(text) > 0.15
            if no_amount and text or junk:
                bad.append(r)
        if bad:
            findings.append({"check": "unreadable_rows", "amount": 0.0,
                             "what": f"{t.file}: {len(bad)} row(s) could not be read cleanly "
                                     f"({', '.join(where(r) for r in bad[:4])})",
                             "fix": "Check these rows against the scan, or upload a clearer copy.",
                             "source": sheet})
        # 4. dates out of order
        if d_c:
            back = []
            prev = None
            for r in rows:
                d = as_date(t.val(r, d_c))
                if d and prev and (prev - d).days > 31:
                    back.append(r)
                prev = d or prev
            if back:
                findings.append({"check": "dates_out_of_order", "amount": 0.0,
                                 "what": f"{t.file}: dates jump back on {', '.join(where(r) for r in back[:4])}",
                                 "fix": "A date may be misread (day and month swapped, or a wrong digit).",
                                 "source": sheet})
    summary = (f"{len(findings)} possible misread(s) in the scanned files:\n"
               + "\n".join(f"- {f['what']}. Fix: {f['fix']}" for f in findings)) if findings \
        else "No signs of misread figures in the scanned files."
    return ToolOutput(data={"findings": findings}, summary=summary, citations=cites[:20])


def scanned_names(refs: list[Any]) -> set[str]:
    """Files that came from a PDF or an image (their rows were read by OCR)."""
    out = set()
    for r in refs:
        fmt = str((getattr(r, "source", None) or {}).get("format") or "").lower()
        if getattr(r, "origin", "") == "line_items" or fmt in ("pdf", "png", "jpg", "jpeg") \
                or re.search(r"\.(pdf|png|jpe?g)$|ai working copy", r.name, re.IGNORECASE):
            out.add(r.name)
    return out

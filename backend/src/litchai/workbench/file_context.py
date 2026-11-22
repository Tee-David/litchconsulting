"""What each file in a job is, and what it is for (plan v5: files as job context).

When a file is added (alone or from a ZIP, RAR or 7z), the engine labels it with
no model: a bank statement (and which bank), a trial balance, a ledger or cash
book, invoices, payroll, an asset register, a sales or settlement report, a letter
or contract, or books with several sheets. It notes the period, the rows and the
main totals. The person can correct the label and add a note ("use for the bank
rec"). The agent sees one line per file (``manifest``), so "reconcile the GTBank
statement to the TB" or "use the loan letter" points at the right file.
``read_document`` gives the text of a letter, PDF or DOCX, with page numbers.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from litchai.workbench.context import ToolContext, ToolError, ToolOutput
from litchai.workbench.model import Sheet, Workbook, to_number
from litchai.workbench.tables import detect_table

ROLES = {
    "trial_balance": "trial balance",
    "bank_statement": "bank statement",
    "ledger": "ledger or cash book",
    "invoices": "invoices",
    "payroll": "payroll",
    "asset_register": "fixed asset register",
    "sales_report": "sales or settlement report",
    "register": "register or schedule",
    "template": "blank template (a form to fill, not client figures)",
    "document": "letter, contract or notes",
    "books": "books (several schedules)",
    "other": "other data",
}
BANKS = ("GTBank", "Guaranty Trust", "Zenith", "Access", "UBA", "First Bank", "FirstBank",
         "Fidelity", "Stanbic", "Wema", "Sterling", "Union Bank", "Ecobank", "FCMB", "Polaris",
         "Kuda", "OPay", "Moniepoint", "Providus", "Keystone", "Unity", "Jaiz", "Globus",
         "Titan", "Optimus", "Parallex", "Premium Trust", "Lotus", "Taj", "Signature")

_NAME_RULES: list[tuple[str, str]] = [
    (r"trial[\s_-]*balance|\btb\b", "trial_balance"),
    (r"statement|stmt|bank", "bank_statement"),
    (r"ledger|cash[\s_-]*book|journal", "ledger"),
    (r"invoice|billing|receivable|debtor", "invoices"),
    (r"payroll|salar|paye|wages", "payroll"),
    (r"asset[\s_-]*register|fixed[\s_-]*asset|\bfar\b", "asset_register"),
    (r"\bpos\b|paystack|flutterwave|settlement|sales|returns|takings", "sales_report"),
    (r"register|schedule|master", "register"),
    (r"letter|offer|agreement|contract|memo|note|policy|minutes|engagement", "document"),
]


_ISO = re.compile(r"^(?P<y>\d{4})-(?P<m>\d{2})-(?P<d>\d{2})$")
_DMONY = re.compile(r"^(?P<d>\d{1,2})[- ](?P<m>[A-Za-z]{3,9})[- ](?P<y>\d{4})$")  # 01-Jan-2025
_MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug",
                                      "sep", "oct", "nov", "dec"), start=1)}
_DMY = re.compile(r"^(?P<d>\d{1,2})/(?P<m>\d{1,2})/(?P<y>\d{4})$")  # Nigerian dd/mm/yyyy


def _text_only(wb: Workbook) -> bool:
    """A workbook of prose (a letter as a Notes sheet): one column of text, no table."""
    cells = [c for s in wb.sheets.values() for c in s.cells.values() if c.value not in (None, "")]
    if not cells:
        return False
    cols = {k[1] for s in wb.sheets.values() for k in s.cells}
    texty = sum(1 for c in cells if isinstance(c.value, str) and len(c.value) > 25)
    return len(cols) <= 2 and texty >= max(3, len(cells) // 3)


_TEMPLATE_NAME = re.compile(r"template|blank|pro[\s_-]?forma|specimen|illustrative", re.IGNORECASE)
_TEMPLATE_SHEET = re.compile(r"^(instructions?|read ?me|cover( page)?|how to use|guide)$", re.IGNORECASE)


def _is_template(wb: Workbook, filename: str) -> bool:
    """A blank form (an IFRS annual report template, a schedule to fill): its name says
    so, or it has an Instructions or Cover sheet beside the forms."""
    if _TEMPLATE_NAME.search(filename or wb.name or ""):
        return True
    return any(_TEMPLATE_SHEET.match(s.strip()) for s in wb.sheets) and len(wb.sheets) >= 3


def _period(sh: Sheet) -> tuple[str | None, str | None]:
    days: list[date] = []
    for c in sh.cells.values():
        v = c.value
        if isinstance(v, datetime):
            days.append(v.date())
        elif isinstance(v, date):
            days.append(v)
        elif isinstance(v, str) and len(v) <= 12:
            m = _ISO.match(v) or _DMY.match(v) or _DMONY.match(v)
            if m:
                mon = m["m"]
                mon = _MONTHS.get(mon[:3].lower(), 0) if not mon.isdigit() else int(mon)
                try:
                    days.append(date(int(m["y"]), mon, int(m["d"])))
                except ValueError:
                    pass
        if len(days) > 5000:
            break
    if not days:
        return None, None
    return min(days).isoformat(), max(days).isoformat()


_ROLE_ORDER = ["trial_balance", "books", "bank_statement", "payroll", "invoices",
               "asset_register", "sales_report", "ledger", "register", "document", "other"]


def _sheet_role(wb: Workbook, sh: Sheet, filename: str = "") -> str:
    from litchai.workbench.trial_balance import _tb_of

    head = " ".join(str(c.value).lower() for (r, _), c in sh.cells.items() if r <= 3 and c.value)
    name = f"{filename} {sh.name}".lower()
    if _tb_of(wb, sh) is not None:
        return "trial_balance"
    t = detect_table(sh)
    roles = {c.role for c in t.columns} if t else set()
    if {"date", "balance"} <= roles and ({"debit", "credit"} <= roles or "amount" in roles):
        return "bank_statement"
    if "gross pay" in head or re.search(r"\bpaye\b", head) or "net pay" in head:
        return "payroll"
    if "cost" in head and ("depreciation" in head or "rate" in head) and "asset" in (head + name):
        return "asset_register"
    if "invoice" in head or "invoice" in name:
        return "invoices"
    for pat, role in _NAME_RULES:  # the file or sheet name says what it is
        if re.search(pat, name):
            if role == "document" and t is not None and len(t.columns) >= 2:
                continue  # a table is not a letter, whatever its name ("Contracts register")
            return role
    if {"date"} <= roles and ({"debit", "credit"} <= roles or "amount" in roles):
        return "ledger"
    return "other"


def describe(wb: Workbook, filename: str | None = None) -> dict[str, Any]:
    """Label, period, rows and totals for one file (no model)."""
    name = filename or wb.name
    low = name.lower()
    text = " ".join(str(c.value) for s in wb.sheets.values() for (r, _), c in s.cells.items()
                    if r <= 6 and isinstance(c.value, str))[:3000]
    # The bank from the file name first; from the text only for a statement.
    bank = next((b for b in BANKS if b.lower() in low), None)
    if _is_template(wb, name):
        role = "template"
    elif _text_only(wb):
        role = "document"
    else:
        single = len([s for s in wb.sheets.values() if s.cells]) == 1
        per_sheet = {n: _sheet_role(wb, s, name if single else "")
                     for n, s in wb.sheets.items() if s.cells}
        useful = {r for r in per_sheet.values() if r != "other"}
        if len(useful) >= 2 and len(per_sheet) >= 3:
            role = "books"
        else:
            # A fixed order, so a TB with a Notes sheet is the TB, not a letter.
            role = min(useful, key=_ROLE_ORDER.index, default=None) or next(
                (r for pat, r in _NAME_RULES if re.search(pat, low)), "other")
    starts, ends, rows = [], [], 0
    totals: dict[str, float] = {}
    for sh in wb.sheets.values():
        a, b = _period(sh)
        if a:
            starts.append(a)
            ends.append(b)
        t = detect_table(sh)
        if t is None:
            continue
        rows += t.n_rows
        for col in t.columns:
            if col.role in ("debit", "credit", "amount") and len(totals) < 4:
                s = sum(to_number(sh.value(r, col.index)) or 0.0
                        for r in range(t.first_row, t.last_row + 1))
                if s:
                    totals[f"{sh.name}: {col.name}"[:60]] = round(s, 2)
    out: dict[str, Any] = {"role": role, "label": ROLES[role], "rows": rows,
                           "sheets": list(wb.sheets)[:12], "totals": totals}
    if not bank and role == "bank_statement":
        bank = next((b for b in BANKS if b.lower() in text.lower()), None)
    if bank and role in ("bank_statement", "ledger", "document", "other"):
        out["bank"] = bank
    if starts:
        out["period"] = [min(starts), max(ends)]
    return out


def manifest(refs: list[Any], models: dict[str, Workbook]) -> str:
    """One line per file for the agent prompt (short: it is in every step)."""
    lines = []
    for ref in refs:
        m = models.get(ref.id)
        facts = getattr(ref, "facts", None) or (describe(m, ref.name) if m else {})
        role = getattr(ref, "role", None) or facts.get("role") or "other"
        bits = [f"{ref.id} {ref.name}", ROLES.get(role, role)]
        if facts.get("bank"):
            bits[-1] += f" ({facts['bank']})"
        if facts.get("period"):
            bits.append(" to ".join(facts["period"]))
        if facts.get("rows"):
            bits.append(f"{facts['rows']} rows")
        if getattr(ref, "group", None):
            bits.append(f"from {ref.group}")
        if getattr(ref, "note", ""):
            bits.append(f"use: {ref.note}")
        lines.append("- " + " · ".join(bits))
    return "\n".join(lines)


def read_document(ctx: ToolContext, *, workbook: str, max_chars: int = 8000) -> ToolOutput:
    """The text of a document file (letter, PDF or DOCX notes), with page numbers."""
    wb = ctx.workbook(workbook)
    lines: list[str] = []
    for sh in wb.sheets.values():
        rows: dict[int, list[tuple[int, Any]]] = {}
        for (r, c), cell in sh.cells.items():
            if cell.value not in (None, ""):
                rows.setdefault(r, []).append((c, cell.value))
        page = None
        for r in sorted(rows):
            p = sh.source_pages.get(r)
            if p and p != page:
                lines.append(f"[page {p}]")
                page = p
            lines.append(" ".join(str(v) for _, v in sorted(rows[r])))
    text = "\n".join(lines).strip()
    if not text:
        raise ToolError(f"{wb.name} has no text")
    cut = len(text) > max_chars
    return ToolOutput(data={"file": wb.name, "text": text[:max_chars], "truncated": cut,
                            "chars": len(text)},
                      summary=f"Read {wb.name} ({len(text):,} characters"
                              + (", first part shown" if cut else "") + ").",
                      citations=[f"{wb.name}"])

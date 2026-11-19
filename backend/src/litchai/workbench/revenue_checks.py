"""Standard revenue-assurance checks (edge-case suite, 19 Nov): what an accountant runs
on any sales data before trusting the revenue figure. Rules on column meanings, never
on one client's file names:

- duplicate lines (same id/batch, category, date and amount);
- voided, cancelled, reversed or refunded lines still in the totals;
- VAT charged on exempt items (basic food, medical, education, baby, agriculture);
- cash banked below the till figure, and cash banked with no sales recorded;
- trading days with no sales lines for a branch;
- processor or card fees (often missing when sales are booked net);
- sales dated after the books were closed (cut-off).

Each finding has the amount, the source rows and the fix. Read only.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from litchai.workbench.context import ToolContext, ToolOutput
from litchai.workbench.model import Sheet, to_number
from litchai.workbench.tables import Table, detect_table

VOID = re.compile(r"\b(void(ed)?|cancel+ed|cancel|revers(ed|al)|refund(ed)?)\b", re.IGNORECASE)
EXEMPT = re.compile(r"basic food|food items?|unprocessed food|staple|medical|pharma|drug|"
                    r"education|school|book|baby|agric|fertili[sz]er|exported", re.IGNORECASE)
CLOSED = re.compile(r"closed on (\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]+) (\d{4})", re.IGNORECASE)
MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug",
                                      "sep", "oct", "nov", "dec"), start=1)}


def _date(v: Any) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", v.strip()) or None
        if m:
            try:
                return date(int(m[3]), int(m[2]), int(m[1]))
            except ValueError:
                return None
        try:
            return date.fromisoformat(v.strip()[:10])
        except ValueError:
            return None
    return None


def _head(sh: Sheet, t: Table, *words: str) -> int | None:
    for c in t.columns:
        n = c.name.lower()
        if any(w in n for w in words):
            return c.index
    return None


def _money(x: float) -> str:
    return f"{x:,.2f}"


def sales_checks(ctx: ToolContext) -> ToolOutput:
    findings: list[dict[str, Any]] = []
    from litchai.taxconfig import load_tax_config

    vat_rate = load_tax_config()["vat"]["standardRatePct"] / 100
    corrected = {"gross": 0.0, "vat": 0.0, "have": False}  # sales after the checks
    closed: date | None = None
    for wb in ctx.workbooks.values():
        for sh in wb.sheets.values():
            for cell in sh.cells.values():
                m = CLOSED.search(str(cell.value or ""))
                if m and m[2][:3].lower() in MONTHS:
                    closed = date(int(m[3]), MONTHS[m[2][:3].lower()], int(m[1]))
    banked_days: dict[tuple[str, date], float] = {}
    sales_days: dict[str, set[date]] = defaultdict(set)
    for wb in ctx.workbooks.values():
        for sh in wb.sheets.values():
            t = detect_table(sh)
            if t is None or t.n_rows == 0:
                continue
            src = f"{wb.name}"
            amt = t.col("amount") or t.col("credit")
            amt_i = amt.index if amt else _head(sh, t, "gross", "sales", "amount", "value")
            d_i = t.col("date").index if t.col("date") else None
            branch_i = _head(sh, t, "branch", "store", "shop", "outlet", "location")
            status_i = _head(sh, t, "status", "state", "flag")
            cat_i = _head(sh, t, "category", "item", "product", "department")
            vat_i = next((c.index for c in t.columns if "vat" in c.name.lower() and not re.search(
                r"incl|excl|gross|net of|before|after", c.name, re.IGNORECASE)), None)
            id_i = _head(sh, t, "batch", "receipt", "invoice", "transaction id", "txn", "id")
            till_i = _head(sh, t, "per till", "till", "expected", "cash sales")
            bank_i = _head(sh, t, "banked", "deposit", "lodg")
            fee_i = next((c.index for c in t.columns if re.search(
                r"\bfees?\b|commission|\bmdr\b", c.name, re.IGNORECASE)), None)
            rows = range(t.first_row, t.last_row + 1)

            # cash banked vs till, and banked with no sales
            if till_i and bank_i and till_i != bank_i:
                short, nosales = [], []
                for r in rows:
                    till, bank = to_number(sh.value(r, till_i)), to_number(sh.value(r, bank_i))
                    d = _date(sh.value(r, d_i)) if d_i else None
                    b = str(sh.value(r, branch_i) or "") if branch_i else ""
                    if bank and d:
                        banked_days[(b, d)] = bank
                    if till is None and bank:
                        nosales.append((b, d, bank, r))
                    elif till is not None and bank is not None and bank < till - 0.5:
                        short.append((b, d, till - bank, r))
                if short:
                    tot = sum(x[2] for x in short)
                    where = "; ".join(f"{b} {d}" for b, d, _, _ in short[:6])
                    findings.append({"check": "cash_short", "amount": round(tot, 2),
                                     "what": f"Cash banked is {_money(tot)} less than the till "
                                             f"figure on {len(short)} day(s): {where}",
                                     "fix": "Ask the branch for the missing cash; if not "
                                            "recovered, record it as a cash shortage (loss or "
                                            "staff receivable).", "source": src})
                if nosales:
                    tot = sum(x[2] for x in nosales)
                    where = "; ".join(f"{b} {d}" for b, d, _, _ in nosales[:6])
                    findings.append({"check": "banked_without_sales", "amount": round(tot, 2),
                                     "what": f"Cash of {_money(tot)} was banked with no sales "
                                             f"recorded: {where}",
                                     "fix": "Record these sales (the POS may have been down); "
                                            "they are missing from revenue and VAT.",
                                     "source": src})
            # processor fees
            if fee_i and re.search(r"settle|card|processor|paystack|pos|payout", wb.name + sh.name,
                                   re.IGNORECASE):
                fees = sum(to_number(sh.value(r, fee_i)) or 0 for r in rows)
                if fees:
                    findings.append({"check": "processor_fees", "amount": round(fees, 2),
                                     "what": f"Processor or card fees total {_money(fees)}",
                                     "fix": "If sales were booked at the net payout, gross up "
                                            "revenue and record the fees as an expense.",
                                     "source": src})
            if not (amt_i and (cat_i or status_i or id_i)):
                continue
            skip: set[int] = set()  # voided lines and second copies, left out of later sums
            # voids
            if status_i:
                v = [(r, to_number(sh.value(r, amt_i)) or 0) for r in rows
                     if VOID.search(str(sh.value(r, status_i) or ""))]
                if v:
                    tot = sum(x[1] for x in v)
                    findings.append({"check": "voids_in_totals", "amount": round(tot, 2),
                                     "what": f"{len(v)} voided, cancelled or reversed line(s) "
                                             f"worth {_money(tot)} are still in the data",
                                     "fix": "Take them out of revenue and VAT.", "source": src,
                                     "rows": [r for r, _ in v][:20]})
                    skip |= {r for r, _ in v}
            # duplicates
            key_cols = [c for c in (id_i, cat_i, d_i, branch_i) if c]
            if key_cols:
                seen: dict[tuple, list[int]] = defaultdict(list)
                for r in rows:
                    seen[(*[str(sh.value(r, c)) for c in key_cols],
                          to_number(sh.value(r, amt_i)))].append(r)
                dups = [rs for rs in seen.values() if len(rs) > 1]
                for rs in dups:
                    skip |= set(rs[1:])
                if dups:
                    extra = sum((len(rs) - 1) * (to_number(sh.value(rs[0], amt_i)) or 0)
                                for rs in dups)
                    groups = defaultdict(set)
                    for rs in dups:
                        b = str(sh.value(rs[0], branch_i) or "") if branch_i else ""
                        d = _date(sh.value(rs[0], d_i)) if d_i else None
                        groups[b].add(d)
                    where = "; ".join(f"{b} {min(ds)} to {max(ds)}" for b, ds in groups.items()
                                      if all(ds)) or "see rows"
                    findings.append({"check": "duplicates", "amount": round(extra, 2),
                                     "what": f"{sum(len(rs) - 1 for rs in dups)} duplicate "
                                             f"line(s) worth {_money(extra)}: {where}",
                                     "fix": "Remove the second copies (an upload done twice).",
                                     "source": src})
            # corrected figures: voids and second copies out, no VAT on exempt items
            if vat_i:
                corrected["have"] = True
                for r in rows:
                    if r in skip:
                        continue
                    corrected["gross"] += to_number(sh.value(r, amt_i)) or 0.0
                    if not (cat_i and EXEMPT.search(str(sh.value(r, cat_i) or ""))):
                        corrected["vat"] += to_number(sh.value(r, vat_i)) or 0.0
            # VAT on exempt items
            if vat_i and cat_i:
                ex = [(r, to_number(sh.value(r, vat_i)) or 0) for r in rows
                      if r not in skip and EXEMPT.search(str(sh.value(r, cat_i) or ""))
                      and (to_number(sh.value(r, vat_i)) or 0) > 0]
                if ex:
                    tot = sum(x[1] for x in ex)
                    cats = sorted({str(sh.value(r, cat_i)) for r, _ in ex})[:4]
                    findings.append({"check": "vat_on_exempt", "amount": round(tot, 2),
                                     "what": f"VAT of {_money(tot)} was charged on exempt items "
                                             f"({', '.join(cats)})",
                                     "fix": "Exempt or zero-rated items carry no output VAT: "
                                            "correct the POS rates, move this VAT to revenue (or "
                                            "refund customers) and lower output VAT.",
                                     "source": src})
            # trading days and cut-off
            if d_i:
                ds = [_date(sh.value(r, d_i)) for r in rows]
                for r, d in zip(rows, ds, strict=True):
                    if d:
                        sales_days[str(sh.value(r, branch_i) or "") if branch_i else ""].add(d)
                if closed:
                    late = [(r, to_number(sh.value(r, amt_i)) or 0) for r, d in zip(rows, ds, strict=True)
                            if d and d > closed]
                    if late:
                        tot = sum(x[1] for x in late)
                        findings.append({"check": "cut_off", "amount": round(tot, 2),
                                         "what": f"Sales of {_money(tot)} are dated after the "
                                                 f"books were closed on {closed}",
                                         "fix": "Include them in this period (cut-off).",
                                         "source": src})
    # days with banked cash but no sales lines, per branch
    gaps = []
    for (b, d), bank in banked_days.items():
        if sales_days and b in sales_days and d not in sales_days[b]:
            gaps.append((b, d, bank))
    if gaps and not any(f["check"] == "banked_without_sales" for f in findings):
        tot = sum(x[2] for x in gaps)
        findings.append({"check": "missing_sales_days", "amount": round(tot, 2),
                         "what": "Days with cash banked but no sales lines: "
                                 + "; ".join(f"{b} {d}" for b, d, _ in gaps[:6]),
                         "fix": "Find and record the sales of those days.", "source": "sales"})
    for b, days in sales_days.items():
        if len(days) > 20:
            lo, hi = min(days), max(days)
            missing = [lo + timedelta(i) for i in range((hi - lo).days + 1)
                       if lo + timedelta(i) not in days]
            if 0 < len(missing) <= 10 and b:
                findings.append({"check": "missing_trading_days", "amount": None,
                                 "what": f"{b}: no sales lines on {', '.join(map(str, missing))}",
                                 "fix": "Confirm the shop was closed, or find the sales.",
                                 "source": "sales"})
    data: dict[str, Any] = {"findings": findings,
                            "books_closed_on": str(closed) if closed else None}
    if corrected["have"]:
        extra = sum(f["amount"] for f in findings if f["check"] == "banked_without_sales")
        vat = corrected["vat"] + extra * vat_rate / (1 + vat_rate)  # unrecorded: standard rate
        gross = corrected["gross"] + extra
        data["corrected"] = {"gross_sales": round(gross, 2), "output_vat": round(vat, 2),
                             "net_sales": round(gross - vat, 2),
                             "basis": "valid lines only (no voids, no second copies), no VAT on "
                                      "exempt items, unrecorded banked sales added at the "
                                      f"standard rate ({vat_rate:.1%})"}
    # Plain sentences, not codes: the summary is what a person reads (also in the
    # model-free fallback answer).
    lines = [f"- {f['what']}. Fix: {f['fix']}" for f in findings]
    if "corrected" in data:
        c = data["corrected"]
        lines.append(f"- Corrected for the period: net sales {_money(c['net_sales'])}, output "
                     f"VAT {_money(c['output_vat'])} (gross {_money(c['gross_sales'])}; "
                     f"{c['basis']}).")
    summary = (f"{len(findings)} revenue finding(s):\n" + "\n".join(lines)) if findings else \
        "No revenue findings from the standard checks."
    return ToolOutput(data=data, summary=summary)

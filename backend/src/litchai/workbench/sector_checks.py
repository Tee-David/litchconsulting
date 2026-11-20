"""Standard checks for more kinds of client (edge-case suite, cases 5-10).

Each check reads the tables by their column names (no model), and returns findings
with the amount, the source and the fix, like the sales, payroll and grant checks:

- import_checks: landed cost expensed, USD payables not revalued at the year-end
  rate, LC charges in cost of sales, goods in transit at the year end;
- rent_checks: rent received in advance taken as income, tenant deposits taken as
  income, rent paid to a company with no WHT, service charge mixed with rent;
- stock_checks: count against the ledger, items held above net realisable value,
  the weighted-average cost recomputed, raw materials and finished goods mixed;
- settlement_checks: duplicate settlements, fees netted, chargebacks, missing days,
  many-to-one matches;
- group_checks: director's personal costs, intercompany balances that do not
  agree, a loan to the director, intercompany sales not eliminated;
- purchase_checks: duplicate vendors, split purchases under the approval limit,
  round sums paid at weekends, invoice-number gaps, vendors with no TIN.

Read only.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime
from difflib import SequenceMatcher
from typing import Any

from litchai.workbench.context import ToolContext, ToolOutput
from litchai.workbench.model import Sheet, to_number
from litchai.workbench.tables import Table, detect_table


# ─── shared helpers ────────────────────────────────────────────────────────────
@dataclass
class Tab:
    file: str
    sheet: Sheet
    table: Table
    heads: str

    def col(self, pat: str, avoid: str | None = None) -> int | None:
        for c in self.table.columns:
            if re.search(pat, c.name, re.IGNORECASE) and not (
                    avoid and re.search(avoid, c.name, re.IGNORECASE)):
                return c.index
        return None

    def rows(self) -> range:
        return range(self.table.first_row, self.table.last_row + 1)

    def val(self, r: int, c: int | None) -> Any:
        return self.sheet.value(r, c) if c else None

    def num(self, r: int, c: int | None) -> float:
        return (to_number(self.val(r, c)) or 0.0) if c else 0.0

    def text(self, r: int, c: int | None) -> str:
        v = self.val(r, c)
        return "" if v is None else str(v).strip()


def tabs(ctx: ToolContext) -> Iterator[Tab]:
    for wb in ctx.workbooks.values():
        for sh in wb.sheets.values():
            t = detect_table(sh)
            if t is not None and t.n_rows:
                yield Tab(wb.name, sh, t, " | ".join(c.name.lower() for c in t.columns))


def tb_accounts(ctx: ToolContext) -> list[tuple[str, float, str]]:
    """(account name, debit minus credit, file) for every trial-balance line."""
    out = []
    for t in tabs(ctx):
        n, d, c = t.col("account name|^account$|description"), t.col("^debit"), t.col("^credit")
        if n and d and c:
            out += [(t.text(r, n), t.num(r, d) - t.num(r, c), t.file) for r in t.rows()
                    if t.text(r, n)]
    return out


def as_date(v: Any) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v or "").strip()[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def m(x: float) -> str:
    return f"{x:,.2f}"


def year_end(ctx: ToolContext) -> date:
    """31 Dec of the year in the file names (books are named …31Dec2025), else last year."""
    for wb in ctx.workbooks.values():
        y = re.search(r"(20\d\d)", wb.name)
        if y and re.search(r"31.?dec|year.?end|books|tb|trial", wb.name, re.IGNORECASE):
            return date(int(y[1]), 12, 31)
    return date(date.today().year - 1, 12, 31)


def result(area: str, findings: list[dict[str, Any]], **extra: Any) -> ToolOutput:
    summary = (f"{len(findings)} {area} finding(s):\n"
               + "\n".join(f"- {f['what']}. Fix: {f['fix']}" for f in findings)) if findings \
        else f"No {area} findings from the standard checks."
    return ToolOutput(data={"findings": findings, **extra}, summary=summary)


def add(findings: list[dict[str, Any]], check: str, amount: float, what: str, fix: str,
        source: str) -> None:
    findings.append({"check": check, "amount": round(amount, 2), "what": what, "fix": fix,
                     "source": source})


def fx_rate_on(ctx: ToolContext, day: date) -> float | None:
    """The official USD rate on or before a day, from a rates table (Date, rate)."""
    best: tuple[date, float] | None = None
    for t in tabs(ctx):
        dc, rc = t.col("^date"), t.col(r"usd|rate|ngn")
        if not (dc and rc) or "rate" not in t.heads + t.file.lower():
            continue
        if t.col(r"debit|credit|amount|supplier|invoice"):
            continue
        for r in t.rows():
            d, v = as_date(t.val(r, dc)), t.num(r, rc)
            if d and v and d <= day and (best is None or d > best[0]):
                best = (d, v)
    return best[1] if best else None


# ─── case 5: importer ──────────────────────────────────────────────────────────
_LANDED = re.compile(r"customs|import duty|\bduty\b|freight in|clearing|demurrage|port charge",
                     re.IGNORECASE)
_LC = re.compile(r"letter of credit|\blc\b|l/c", re.IGNORECASE)


def import_checks(ctx: ToolContext) -> ToolOutput:
    findings: list[dict[str, Any]] = []
    ye = year_end(ctx)
    tb = tb_accounts(ctx)
    landed = [(n, v) for n, v, _ in tb if _LANDED.search(n) and v > 0]
    if landed:
        tot = sum(v for _, v in landed)
        add(findings, "landed_cost_expensed", tot,
            f"Import costs expensed instead of added to the cost of the goods: "
            f"{', '.join(f'{n} {m(v)}' for n, v in landed)} (total {m(tot)})",
            "Under IAS 2 duty, freight and clearing are part of the cost of stock. Move them "
            "into purchases or stock; the share for goods still unsold at the year end goes into "
            "closing stock.", "trial balance")
    lc = [(n, v) for n, v, _ in tb if _LC.search(n) and v > 0 and re.search(r"cost of sales|cos", n,
                                                                           re.IGNORECASE)]
    if lc:
        tot = sum(v for _, v in lc)
        add(findings, "lc_in_cost_of_sales", tot,
            f"Letter of credit charges in cost of sales: {', '.join(f'{n} {m(v)}' for n, v in lc)}",
            "LC charges are a bank or finance cost, not a cost of the goods. Reclassify them.",
            "trial balance")
    rate = fx_rate_on(ctx, ye)
    for t in tabs(ctx):
        usd, booked = t.col(r"usd|\$"), t.col(r"ngn|naira|booked", r"rate")
        if not (usd and booked) or not re.search(r"payable|creditor", t.heads + " " + t.file,
                                                 re.IGNORECASE):
            continue
        if rate:
            gap = sum(t.num(r, usd) * rate - t.num(r, booked) for r in t.rows())
            if abs(gap) > 1:
                owed = sum(t.num(r, usd) for r in t.rows())
                add(findings, "fx_not_revalued", gap,
                    f"USD payables of USD {m(owed)} are still at the rates when booked; at the "
                    f"year-end rate ({m(rate)} on {ye}) they are {m(abs(gap))} "
                    f"{'higher' if gap > 0 else 'lower'}",
                    f"Revalue the USD payables at the closing rate (IAS 21) and book an "
                    f"unrealised exchange {'loss' if gap > 0 else 'gain'} of {m(abs(gap))}.",
                    t.file)
    for t in tabs(ctx):
        bl, arr = t.col(r"b/l|bill of lading|shipped|loaded"), t.col(r"arriv|receiv|landed")
        usd = t.col(r"usd|value|amount")
        if not (bl and arr and usd):
            continue
        rc = t.col(r"rate")
        terms = t.col(r"incoterm|terms")
        transit = [r for r in t.rows() if (as_date(t.val(r, bl)) or ye) <= ye
                   and (as_date(t.val(r, arr)) or date.min) > ye
                   and not re.search(r"cif|dap|ddp", t.text(r, terms), re.IGNORECASE)]
        if transit:
            val = sum(t.num(r, usd) * (t.num(r, rc) or (fx_rate_on(ctx, as_date(t.val(r, bl)) or ye)
                                                        or 1)) for r in transit)
            ids = ", ".join(t.text(r, t.table.columns[0].index) for r in transit)
            add(findings, "goods_in_transit", val,
                f"Goods in transit at the year end: {ids} shipped on or before {ye} (FOB, so "
                f"ours from shipment) but arrived after it; worth {m(val)} and not in stock or "
                "payables", "Record the goods in transit as stock and the amount owed as a "
                "payable at the year end.", t.file)
    return result("import", findings)


# ─── case 6: property ──────────────────────────────────────────────────────────
def rent_checks(ctx: ToolContext) -> ToolOutput:
    from litchai.taxconfig import load_tax_config

    wht_rent = load_tax_config()["wht"]["rates"]["rent"]["corporatePct"] / 100
    findings: list[dict[str, Any]] = []
    ye = year_end(ctx)
    tb = tb_accounts(ctx)
    for t in tabs(ctx):
        frm, to = t.col(r"period from|from|start"), t.col(r"period to|^to$|end|until")
        amt = t.col(r"amount received|received|rent paid by tenant|amount", r"date|service")
        if not (frm and to and amt) or not re.search(r"tenant|rent", t.heads + " " + t.file,
                                                     re.IGNORECASE):
            continue
        ahead, who = 0.0, []
        for r in t.rows():
            a, b = as_date(t.val(r, frm)), as_date(t.val(r, to))
            if not (a and b) or b <= ye:
                continue
            total_days = (b - a).days + 1
            later = (b - max(a, ye + __import__("datetime").timedelta(days=1))).days + 1
            part = t.num(r, amt) * later / total_days
            if part > 1:
                ahead += part
                who.append(t.text(r, t.table.columns[0].index))
        if ahead:
            add(findings, "rent_in_advance", ahead,
                f"Rent received for periods after {ye} is in income: {', '.join(who[:5])} "
                f"({m(ahead)} relates to later years)",
                "Move the part for later years to deferred income (a liability); take it to "
                "income month by month.", t.file)
        sc = t.col(r"service charge")
        if sc:
            tot = sum(t.num(r, sc) for r in t.rows())
            has_sc_account = any(re.search(r"service charge", n, re.IGNORECASE) for n, _, _ in tb)
            if tot > 1 and not has_sc_account:
                add(findings, "service_charge_in_rent", tot,
                    f"Service charge of {m(tot)} collected with the rent is in rent income",
                    "Show the service charge separately (it pays for shared costs and may carry "
                    "VAT); keep it out of rent income.", t.file)
    dep = [(n, v) for n, v, _ in tb if re.search(r"deposit", n, re.IGNORECASE)
           and re.search(r"income|revenue", n, re.IGNORECASE) and v < 0]
    if dep:
        tot = -sum(v for _, v in dep)
        add(findings, "deposits_as_income", tot,
            f"Tenant deposits of {m(tot)} are in income ({', '.join(n for n, _ in dep)})",
            "A refundable deposit is owed back to the tenant: show it as a liability, not "
            "income.", "trial balance")
    for t in tabs(ctx):
        land, gross, wht = t.col(r"landlord|payee"), t.col(r"gross|rent"), t.col(r"wht|withholding")
        if not (land and gross and wht):
            continue
        kind = t.col(r"type|status")
        miss = [r for r in t.rows() if t.num(r, wht) <= 0 and (
            re.search(r"company|corporate|ltd|plc|limited", t.text(r, kind) + " "
                      + t.text(r, land), re.IGNORECASE))]
        if miss:
            base = sum(t.num(r, gross) for r in miss)
            add(findings, "no_wht_on_rent", base * wht_rent,
                f"No WHT deducted on rent of {m(base)} paid to a company "
                f"({', '.join(sorted({t.text(r, land) for r in miss}))}); "
                f"{m(base * wht_rent)} at {wht_rent:.0%} should have been withheld",
                "Deduct WHT on future payments; the company is liable for the amount not "
                "withheld, so remit it or get the landlord's credit note.", t.file)
    return result("rent", findings)

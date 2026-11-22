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
    if best:
        return best[1]
    # v8: no rates file in the job: the CBN official rate kept on the server
    from litchai.fx_rates import rate_on

    hit = rate_on("USD", day)
    return hit[0] if hit else None


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


# ─── case 7: manufacturer ──────────────────────────────────────────────────────
def stock_checks(ctx: ToolContext) -> ToolOutput:
    findings: list[dict[str, Any]] = []
    tb = tb_accounts(ctx)
    count = None
    for t in tabs(ctx):
        if t.col(r"count") and t.col(r"ledger|book|system") and t.col(r"unit cost|cost"):
            count = t
    if count is None:
        return result("stock", findings)
    code = count.col(r"item code|code|sku")
    cq, lq = count.col(r"count"), count.col(r"ledger|book|system")
    uc, nrv = count.col(r"unit cost|cost"), count.col(r"selling|nrv|realisable|realizable")
    cat = count.col(r"categor|class|type")
    short = [(count.text(r, code), (count.num(r, lq) - count.num(r, cq)) * count.num(r, uc))
             for r in count.rows() if abs(count.num(r, lq) - count.num(r, cq)) > 0]
    if short:
        tot = sum(v for _, v in short)
        add(findings, "count_vs_ledger", tot,
            f"The stock count differs from the ledger on {len(short)} item(s) "
            f"({', '.join(c for c, _ in short[:5])}); the ledger is {m(tot)} "
            f"{'higher' if tot > 0 else 'lower'} at cost",
            "Investigate the differences; adjust the ledger to the count and write off "
            "the shortage (or find the missing stock).", count.file)
    if nrv:
        down = [(count.text(r, code), count.num(r, cq) * (count.num(r, uc) - count.num(r, nrv)))
                for r in count.rows() if 0 < count.num(r, nrv) < count.num(r, uc)]
        if down:
            tot = sum(v for _, v in down)
            add(findings, "below_nrv", tot,
                f"Stock held at cost above its net realisable value: {', '.join(c for c, _ in down[:5])}"
                f" (write-down {m(tot)})",
                "IAS 2: value stock at the lower of cost and NRV. Write the items down to NRV "
                "(obsolete or slow-moving stock).", count.file)
    # weighted average from the purchases of the year
    buys: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for t in tabs(ctx):
        if t is count:
            continue
        pc, qc, pr = t.col(r"item code|code|sku"), t.col(r"qty|quantity"), t.col(r"unit price|price|unit cost")
        if pc and qc and pr and t.col(r"date"):
            for r in t.rows():
                b = buys[t.text(r, pc)]
                b[0] += t.num(r, qc)
                b[1] += t.num(r, qc) * t.num(r, pr)
    if buys:
        gap, items = 0.0, []
        for r in count.rows():
            b = buys.get(count.text(r, code))
            if b and b[0]:
                wavg = b[1] / b[0]
                d = (count.num(r, uc) - wavg) * count.num(r, cq)
                if abs(count.num(r, uc) - wavg) > 0.01 * wavg:
                    gap += d
                    items.append(count.text(r, code))
        if items:
            add(findings, "weighted_average", gap,
                f"Unit costs do not match the weighted average of this year's purchases for "
                f"{', '.join(items[:5])}; stock is {m(abs(gap))} {'over' if gap > 0 else 'under'}stated",
                "Recompute the weighted-average cost from the purchases and correct closing "
                "stock.", count.file)
    if cat:
        kinds = Counter(re.sub(r"s$", "", count.text(r, cat).lower()) for r in count.rows())
        stock_accts = [n for n, v, _ in tb if re.search(r"inventor|stock", n, re.IGNORECASE)]
        if len(kinds) >= 2 and len(stock_accts) <= 1:
            fg = sum(count.num(r, cq) * count.num(r, uc) for r in count.rows()
                     if re.search(r"finish", count.text(r, cat), re.IGNORECASE))
            add(findings, "classes_mixed", fg,
                f"Raw materials and finished goods are in one stock account "
                f"({', '.join(stock_accts) or 'inventory'}); finished goods are {m(fg)}",
                "Split stock into raw materials, work in progress and finished goods "
                "(IAS 2 asks for each class).", "trial balance")
    return result("stock", findings)


# ─── case 8: settlements (fintech, agency banking) ─────────────────────────────
def settlement_checks(ctx: ToolContext) -> ToolOutput:
    findings: list[dict[str, Any]] = []
    tb = tb_accounts(ctx)
    txns = sets = None
    for t in tabs(ctx):
        if t.col(r"txn ids|transaction ids|txn refs|covers"):
            sets = t
        elif t.col(r"txn id|transaction id|reference") and t.col(r"amount") and t.col(r"date"):
            txns = t
    if sets is None or txns is None:
        return result("settlement", findings)
    ids_c = sets.col(r"txn ids|transaction ids|txn refs|covers")
    sid_c = sets.col(r"settlement id|batch|^id$")
    net_c, fee_c = sets.col(r"net"), sets.col(r"fee")
    seen: dict[frozenset[str], str] = {}
    covered: set[str] = set()
    dup_amt, dups = 0.0, []
    for r in sets.rows():
        ids = frozenset(x.strip() for x in re.split(r"[;,|]", sets.text(r, ids_c)) if x.strip())
        if ids in seen:
            dup_amt += sets.num(r, net_c)
            dups.append(f"{sets.text(r, sid_c)} repeats {seen[ids]}")
        else:
            seen[ids] = sets.text(r, sid_c)
        covered |= ids
    if dups:
        add(findings, "duplicate_settlement", dup_amt,
            f"Settled twice: {', '.join(dups[:5])} ({m(dup_amt)})",
            "Ask the processor to recover the second payment, or reverse it in the books.",
            sets.file)
    id_c, amt_c, d_c = txns.col(r"txn id|transaction id|reference"), txns.col(r"amount"), txns.col(r"date")
    type_c = txns.col(r"type|status")
    by_day: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])  # all, unsettled
    cb = 0.0
    for r in txns.rows():
        day = str(as_date(txns.val(r, d_c)) or txns.text(r, d_c))
        a = txns.num(r, amt_c)
        if re.search(r"chargeback|dispute|reversal", txns.text(r, type_c), re.IGNORECASE):
            cb += abs(a)
            continue
        by_day[day][0] += a
        if txns.text(r, id_c) not in covered:
            by_day[day][1] += a
    gaps = sorted(d for d, (a, u) in by_day.items() if a and abs(a - u) < 1)
    if gaps:
        tot = sum(by_day[d][1] for d in gaps)
        add(findings, "day_not_settled", tot,
            f"No settlement for the transactions of {', '.join(gaps[:5])} ({m(tot)})",
            "Chase the processor for the missing settlement and show it as a receivable at "
            "the period end.", txns.file)
    if fee_c:
        fees = sum(sets.num(r, fee_c) for r in sets.rows())
        if fees > 1 and not any(re.search(r"fee|charge|commission", n, re.IGNORECASE) and v > 0
                                for n, v, _ in tb):
            add(findings, "fees_netted", fees,
                f"Processor fees of {m(fees)} were deducted from the settlements, but the books "
                "show no fee expense (income is booked net)",
                "Book income gross and the fees as an expense (do not net them).", sets.file)
    if cb > 1 and not any(re.search(r"chargeback|dispute", n, re.IGNORECASE) for n, _, _ in tb):
        add(findings, "chargebacks_not_booked", cb,
            f"Chargebacks of {m(cb)} in the transactions are not in the books",
            "Book the chargebacks (a reduction of income or a receivable from the agent).",
            txns.file)
    return result("settlement", findings)


# ─── case 9: small group and director ──────────────────────────────────────────
_PERSONAL = re.compile(r"school fees|holiday|vacation|personal|\bwife\b|children|\bhome\b|"
                       r"household|birthday|wedding|tithe|private|family", re.IGNORECASE)


def group_checks(ctx: ToolContext) -> ToolOutput:
    findings: list[dict[str, Any]] = []
    tb = tb_accounts(ctx)
    for t in tabs(ctx):
        desc, amt = t.col(r"description|narration|details|memo"), t.col(r"amount|debit")
        if not (desc and amt) or t.col(r"account name") and t.col(r"^credit"):
            continue
        hits = [(t.text(r, desc), t.num(r, amt)) for r in t.rows() if _PERSONAL.search(t.text(r, desc))]
        if hits:
            tot = sum(a for _, a in hits)
            add(findings, "personal_costs", tot,
                f"Personal costs paid by the company: {', '.join(d for d, _ in hits[:4])} "
                f"({len(hits)} payment(s), {m(tot)})",
                "Charge them to the director's account (or treat them as pay, with PAYE); they "
                "are not company expenses and not tax-deductible.", t.file)
    dues = [(n, v, f) for n, v, f in tb if re.search(r"due (from|to)|intercompany|inter-company|"
                                                    r"related compan", n, re.IGNORECASE)]
    if len(dues) >= 2:
        net = sum(v for _, v, _ in dues)
        if abs(net) > 1:
            add(findings, "intercompany_mismatch", abs(net),
                "Intercompany balances do not agree: "
                + "; ".join(f"{n} {m(v)} ({f})" for n, v, f in dues)
                + f"; the difference is {m(abs(net))}",
                "Reconcile the two ledgers (cash or invoices in transit, a missed entry) and "
                "agree the balances before consolidation.", "trial balances")
    loan = [(n, v) for n, v, _ in tb if re.search(r"director", n, re.IGNORECASE)
            and re.search(r"loan|current account|receivable|advance", n, re.IGNORECASE) and v > 0]
    if loan:
        tot = sum(v for _, v in loan)
        no_interest = not any(re.search(r"interest (income|received)", n, re.IGNORECASE)
                              for n, _, _ in tb)
        add(findings, "director_loan", tot,
            f"Loan to the director of {m(tot)}" + (" with no interest charged" if no_interest else ""),
            "Get board approval and a written agreement; disclose it as a related-party loan. "
            "An interest-free loan is a benefit to the director (tax).", "trial balance")
    sales = [(n, v, f) for n, v, f in tb if v < 0 and re.search(
        r"sales to|intercompany (sales|revenue)|revenue from (a )?related", n, re.IGNORECASE)]
    if sales:
        tot = -sum(v for _, v, _ in sales)
        add(findings, "intercompany_sales", tot,
            f"Intercompany sales of {m(tot)} ({', '.join(n for n, _, _ in sales)}) are not "
            "eliminated",
            "On consolidation remove the sale and the matching purchase, and any profit still "
            "in the buyer's stock.", "trial balances")
    return result("group", findings)


# ─── case 10: purchases fraud review ───────────────────────────────────────────
def _approval_limit(ctx: ToolContext) -> float:
    for wb in ctx.workbooks.values():
        for sh in wb.sheets.values():
            for c in sh.cells.values():
                s = str(c.value or "")
                if re.search(r"approval limit|approve.*up to|limit of", s, re.IGNORECASE):
                    n = re.search(r"([\d,]{5,})", s)
                    if n:
                        return float(n[1].replace(",", ""))
    return 5_000_000.0


def purchase_checks(ctx: ToolContext) -> ToolOutput:
    findings: list[dict[str, Any]] = []
    vendors = pays = None
    for t in tabs(ctx):
        if t.col(r"tin|tax id") or (t.col(r"bank account|account no") and t.col(r"vendor|supplier")
                                    and not t.col(r"amount")):
            vendors = t
        elif t.col(r"amount") and t.col(r"date") and t.col(r"vendor|supplier|payee"):
            pays = t
    if pays is None:
        return result("purchases", findings)
    pv, pd, pa = pays.col(r"vendor id|supplier id|vendor|supplier|payee"), pays.col(r"date"), pays.col(r"amount")
    paid: dict[str, float] = defaultdict(float)
    for r in pays.rows():
        paid[pays.text(r, pv)] += pays.num(r, pa)
    if vendors is not None:
        vid, vn = vendors.col(r"vendor id|supplier id|^id$|code"), vendors.col(r"name")
        vb, vt = vendors.col(r"bank account|account no"), vendors.col(r"tin|tax id")
        rows = [(vendors.text(r, vid), vendors.text(r, vn), vendors.text(r, vb), vendors.text(r, vt))
                for r in vendors.rows()]
        pairs = []
        for i, a in enumerate(rows):
            for b in rows[i + 1:]:
                same_bank = a[2] and a[2] == b[2]
                similar = SequenceMatcher(None, re.sub(r"\W|ltd|limited|nig", "", a[1].lower()),
                                          re.sub(r"\W|ltd|limited|nig", "", b[1].lower())).ratio() > 0.85
                if same_bank or similar:
                    pairs.append((a, b, same_bank))
        if pairs:
            tot = sum(paid.get(b[0], 0) + paid.get(b[1], 0) for _, b, _ in pairs)
            add(findings, "duplicate_vendor", tot,
                "Possible duplicate vendors: " + "; ".join(
                    f"{a[1]} ({a[0]}) and {b[1]} ({b[0]})" + (" share one bank account" if s else
                                                              " have near-identical names")
                    for a, b, s in pairs[:4]) + f"; {m(tot)} paid to the second record",
                "Confirm each vendor with documents; block the duplicate and review every "
                "payment to it.", vendors.file)
        no_tin = [x for x in rows if not x[3] or re.fullmatch(r"(n/?a|none|-|0)", x[3], re.IGNORECASE)]
        if no_tin:
            tot = sum(paid.get(x[0], 0) + paid.get(x[1], 0) for x in no_tin)
            add(findings, "vendor_no_tin", tot,
                f"Vendors with no TIN: {', '.join(f'{x[1]} ({x[0]})' for x in no_tin[:5])} "
                f"({m(tot)} paid)", "Get the TIN before paying (needed for WHT and to prove the "
                "vendor is real); hold payments until then.", vendors.file)
    limit = _approval_limit(ctx)
    groups: dict[tuple[str, str], list[int]] = defaultdict(list)
    for r in pays.rows():
        groups[(pays.text(r, pv), str(as_date(pays.val(r, pd))))].append(r)
    splits = [(k, rs) for k, rs in groups.items() if len(rs) >= 2
              and all(pays.num(r, pa) < limit for r in rs) and sum(pays.num(r, pa) for r in rs) > limit]
    if splits:
        tot = sum(pays.num(r, pa) for _, rs in splits for r in rs)
        add(findings, "split_purchases", tot,
            f"Payments split to stay under the approval limit ({m(limit)}): "
            + "; ".join(f"{v} on {d}: {len(rs)} payments" for (v, d), rs in splits[:4])
            + f" ({m(tot)} in total)",
            "Treat each group as one purchase; check who approved it and why it was split.",
            pays.file)
    wk = [r for r in pays.rows() if (d := as_date(pays.val(r, pd))) and d.weekday() >= 5
          and pays.num(r, pa) >= 100_000 and pays.num(r, pa) % 100_000 == 0]
    if wk:
        tot = sum(pays.num(r, pa) for r in wk)
        add(findings, "weekend_round_sums", tot,
            f"{len(wk)} round-sum payment(s) made at weekends ({m(tot)})",
            "Check the invoice, the goods received and the approval for each one.", pays.file)
    vc = pays.col(r"voucher|pv no|pv number|payment no")
    if vc:
        nums = sorted({int(n[0]) for r in pays.rows() if (n := re.findall(r"\d+", pays.text(r, vc)))})
        missing = [n for n in range(nums[0], nums[-1] + 1) if n not in set(nums)] if nums else []
        if missing:
            add(findings, "voucher_gaps", 0.0,
                f"{len(missing)} payment voucher number(s) missing from the sequence "
                f"({', '.join(map(str, missing[:8]))})",
                "Find the missing vouchers (cancelled ones must be kept); a gap can hide a "
                "payment.", pays.file)
    return result("purchases", findings)


# ─── one entry point for the agent ─────────────────────────────────────────────
KINDS = {"imports": import_checks, "rent": rent_checks, "stock": stock_checks,
         "settlements": settlement_checks, "group": group_checks, "purchases": purchase_checks}


def sector_checks(ctx: ToolContext, kind: str = "auto") -> ToolOutput:
    """One kind, or every kind that finds something ("auto")."""
    if kind in KINDS:
        return KINDS[kind](ctx)
    findings: list[dict[str, Any]] = []
    parts: list[str] = []
    for name, fn in KINDS.items():
        out = fn(ctx)
        got = (out.data or {}).get("findings") or []
        if got:
            findings += [{**f, "kind": name} for f in got]
            parts.append(out.summary)
    if not parts:
        return ToolOutput(data={"findings": []},
                          summary="No findings from the stock, rent, import, settlement, group "
                                  "or purchase checks.")
    return ToolOutput(data={"findings": findings}, summary="\n".join(parts))

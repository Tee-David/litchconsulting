"""Year-end tools (plan v4, slice 4): adjusting journals and the adjusted TB, a loan
schedule from the loan terms, and depreciation from a fixed asset register.

The model only fills inputs (accounts, amounts, reasons, loan terms). The engine
checks every journal balances, lays them out on "Journals", and builds "Adjusted
TB" whose every figure is a formula: bookkeeper balance (a link to the TB cell) +
adjustments (SUMIFS over "Journals") = final debit or credit. The statement and
analysis tools then read "Adjusted TB" first. Every write is a proposal.
"""
from __future__ import annotations

import calendar
import re
from datetime import date, datetime
from typing import Any

from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.model import Sheet, a1, qualify, to_number
from litchai.workbench.ops import OpBuilder
from litchai.workbench.trial_balance import TOLERANCE, TrialBalance, detect_trial_balance

MONEY = '"₦"#,##0.00'
HEAD = {"b": True, "bg": "E8EEF7"}
TOTAL = {"b": True, "bt": True}
JOURNALS = "Journals"
ADJ_TB = "Adjusted TB"


def _source_tb(ctx: ToolContext, sheet: str | None, workbook_id: str | None) -> TrialBalance:
    tb = detect_trial_balance(ctx, sheet or None, workbook_id, skip_adjusted=True)
    if tb is None:
        raise ToolError("no trial balance found to adjust")
    return tb


def _stem(w: str) -> str:
    return w[:-3] + "y" if w.endswith("ies") else w.removesuffix("s")


def _existing_lines(sh: Sheet | None) -> list[dict[str, Any]]:
    """Journal lines already on a "Journals" sheet (an earlier call), kept in order."""
    out: list[dict[str, Any]] = []
    if sh is None:
        return out
    for r in range(2, sh.max_row + 1):
        no, code = sh.value(r, 1), sh.value(r, 3)
        if not (isinstance(no, str) and re.match(r"^J\d+", no) and code not in (None, "")):
            continue
        out.append({"no": no, "date": sh.value(r, 2), "code": str(code), "name": sh.value(r, 4),
                    "debit": to_number(sh.value(r, 5)) or 0.0,
                    "credit": to_number(sh.value(r, 6)) or 0.0,
                    "reason": sh.value(r, 7) or "", "source": sh.value(r, 8) or ""})
    return out


def post_journals(ctx: ToolContext, *, journals: list[dict[str, Any]], sheet: str | None = None,
                  workbook_id: str | None = None, replace: bool = False) -> ToolOutput:
    tb = _source_tb(ctx, sheet, workbook_id)
    wb = tb.workbook
    by_code = {a.code: a for a in tb.accounts if a.code}
    by_name = {a.name.strip().lower(): a for a in tb.accounts}
    new_accounts: dict[str, str] = {}

    def resolve(line: dict[str, Any]) -> tuple[str, str]:
        raw = str(line.get("account") or line.get("code") or "").strip()
        m = re.match(r"^(\d{3,6})\b\s*[-–:]?\s*(.*)$", raw)
        code, rest = (m.group(1), m.group(2).strip()) if m else ("", raw)
        if code and code in by_code:
            return code, by_code[code].name
        if code and rest:
            new_accounts[code] = rest  # a code the TB does not have: a new account
            return code, rest
        key = (rest or raw).lower()
        if key in by_name:
            a = by_name[key]
            return a.code or a.name, a.name
        hits = [a for n, a in by_name.items() if key and key in n]
        if not hits and key:
            # Word stems: "Inventories" finds "Inventory (fuel and spares)".
            want = {_stem(w) for w in re.findall(r"[a-z]{3,}", key)}
            hits = [a for n, a in by_name.items()
                    if want and want <= {_stem(w) for w in re.findall(r"[a-z]{3,}", n)}]
        if len(hits) == 1:
            return hits[0].code or hits[0].name, hits[0].name
        name = str(line.get("name") or rest or "").strip()
        if code and name:
            new_accounts[code] = name  # a new account (e.g. 1240 Cash in transit)
            return code, name
        raise ToolError(f"account {raw!r} is not in the trial balance; give a new account as "
                        "'1240 Cash in transit' (code and name)")

    js = wb.sheets.get(JOURNALS)
    lines = [] if replace else _existing_lines(js)
    taken = {ln["no"] for ln in lines}
    n = len(taken)
    problems = []
    for j in journals:
        n += 1
        no = str(j.get("no") or f"J{n}")
        if not no.upper().startswith("J"):
            no = f"J{no}"
        while no in taken:
            n += 1
            no = f"J{n}"
        taken.add(no)
        dr = cr = 0.0
        rows = []
        for ln in j.get("lines") or []:
            code, name = resolve(ln)
            d = round(to_number(ln.get("debit")) or 0.0, 2)
            c = round(to_number(ln.get("credit")) or 0.0, 2)
            if d < 0 or c < 0 or (d and c):
                raise ToolError(f"{no}: a line has a debit or a credit, positive, not both")
            dr, cr = dr + d, cr + c
            rows.append({"no": no, "date": j.get("date") or "", "code": code, "name": name,
                         "debit": d, "credit": c, "reason": str(j.get("reason") or "")[:300],
                         "source": str(j.get("source") or "")[:200]})
        if len(rows) < 2:
            problems.append(f"{no} needs at least two lines")
        elif abs(dr - cr) > 0.005:
            problems.append(f"{no} does not balance: debits {dr:,.2f}, credits {cr:,.2f}")
        lines += rows
    if problems:
        raise ToolError("; ".join(problems[:6]))
    if not lines:
        raise ToolError("no journals given")
    for ln in lines:  # accounts made by earlier calls stay on the adjusted TB
        if ln["code"] not in by_code and not any(a.name == ln["code"] for a in tb.accounts):
            new_accounts.setdefault(ln["code"], ln["name"])

    b = OpBuilder(wb, "post_journals")
    reason = f"post_journals · adjusting {tb.sheet.name}"
    jname = JOURNALS if js is not None else b.create_sheet(JOURNALS, "Adjusting journals")
    for i, h in enumerate(("No", "Date", "Code", "Account", "Debit", "Credit", "Reason",
                           "Source"), start=1):
        b.set(jname, a1(1, i), value=h, reason=reason, style=HEAD)
    r = 2
    for ln in lines:
        d = ln["date"]
        b.set(jname, f"A{r}", value=ln["no"], reason=reason)
        b.set(jname, f"B{r}", value=d.isoformat()[:10] if hasattr(d, "isoformat") else str(d),
              reason=reason)
        b.set(jname, f"C{r}", value=ln["code"], reason=reason)
        b.set(jname, f"D{r}", value=ln["name"], reason=reason)
        b.set(jname, f"E{r}", value=ln["debit"] or None, number_format=MONEY, reason=reason)
        b.set(jname, f"F{r}", value=ln["credit"] or None, number_format=MONEY, reason=reason)
        b.set(jname, f"G{r}", value=ln["reason"], reason=reason)
        b.set(jname, f"H{r}", value=ln["source"], reason=reason)
        r += 1
    last = r - 1
    b.set(jname, f"D{r}", value="Total", reason=reason, style=TOTAL)
    b.set(jname, f"E{r}", formula=f"=SUM(E2:E{last})", number_format=MONEY, reason=reason, style=TOTAL)
    b.set(jname, f"F{r}", formula=f"=SUM(F2:F{last})", number_format=MONEY, reason=reason, style=TOTAL)
    b.set(jname, f"G{r}", formula=f'=IF(ABS(E{r}-F{r})<=0.01,"PASS","FAIL")', reason=reason)

    # Adjusted TB: TB accounts in order, then the new accounts by code.
    src = tb.sheet.name
    accts: list[tuple[str, str, str | None]] = []
    for a in tb.accounts:
        if tb.debit_col:
            link = f"={qualify(src, a1(a.row, tb.debit_col))}-{qualify(src, a1(a.row, tb.credit_col))}"
        else:
            link = f"={qualify(src, a1(a.row, tb.balance_col))}"
        accts.append((a.code or a.name, a.name, link))
    for code in sorted(new_accounts):
        accts.append((code, new_accounts[code], None))
    tname = ADJ_TB if ADJ_TB in wb.sheets else b.create_sheet(ADJ_TB, "Adjusted trial balance")
    for i, h in enumerate(("Code", "Account", "Bookkeeper net", "Adjustments net",
                           "Debit", "Credit"), start=1):
        b.set(tname, a1(1, i), value=h, reason=reason, style=HEAD)
    jr = f"{JOURNALS}!$C$2:$C${last}"
    r = 2
    for code, name, link in accts:
        b.set(tname, f"A{r}", value=code, reason=reason)
        b.set(tname, f"B{r}", value=name, reason=reason)
        b.set(tname, f"C{r}", formula=link or "=0", number_format=MONEY, reason=reason)
        b.set(tname, f"D{r}", formula=(f"=SUMIFS({JOURNALS}!$E$2:$E${last},{jr},A{r})"
                                        f"-SUMIFS({JOURNALS}!$F$2:$F${last},{jr},A{r})"),
              number_format=MONEY, reason=reason)
        b.set(tname, f"E{r}", formula=f"=MAX(0,ROUND(C{r}+D{r},2))", number_format=MONEY, reason=reason)
        b.set(tname, f"F{r}", formula=f"=MAX(0,ROUND(-(C{r}+D{r}),2))", number_format=MONEY,
              reason=reason)
        r += 1
    end = r - 1
    b.set(tname, f"B{r}", value="Total", reason=reason, style=TOTAL)
    for col in "CDEF":
        b.set(tname, f"{col}{r}", formula=f"=SUM({col}2:{col}{end})", number_format=MONEY,
              reason=reason, style=TOTAL)
    b.set(tname, f"B{r + 1}", value="Debits equal credits", reason=reason)
    b.set(tname, f"E{r + 1}", formula=f'=IF(ABS(E{r}-F{r})<={TOLERANCE},"PASS","FAIL")',
          reason=reason)
    from litchai.workbench.condfmt import FAIL_RULE, PASS_RULE

    b.cond_format(tname, f"E{r + 1}", [PASS_RULE, FAIL_RULE], reason=reason)
    batch = finish_batch(ctx, b, f"{len(journals)} adjusting journal(s) and the adjusted TB",
                         f"{jname}, {tname} · {len(lines)} lines")
    prev = {op.cell: op.preview_value for op in batch.ops
            if op.op == "set_cell" and op.sheet == tname and op.new_formula}
    total_dr, total_cr = prev.get(f"E{r}"), prev.get(f"F{r}")
    data = {"journals": sorted(taken, key=lambda x: int(re.sub(r"\D", "", x) or 0)),
            "lines": len(lines), "new_accounts": new_accounts,
            "adjusted_tb": {"sheet": tname, "total_debit": total_dr, "total_credit": total_cr,
                            "balanced": prev.get(f"E{r + 1}")}}
    return ToolOutput(data=data, batch=batch, citations=[qualify(tname, f"E{r}")],
                      summary=(f"{len(journals)} journal(s) posted ({len(lines)} lines in all); "
                               f"adjusted TB debits {total_dr}, credits {total_cr}: "
                               f"{prev.get(f'E{r + 1}')}."))


# --- loan schedule ------------------------------------------------------------------
def _d(v: Any) -> date:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError as exc:
        raise ToolError(f"{v!r} is not a date (use YYYY-MM-DD)") from exc


def _add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def loan_schedule(ctx: ToolContext, *, principal: float, disbursed: str,
                  monthly_rate_pct: float | None = None, annual_rate_pct: float | None = None,
                  principal_repayment: float, first_repayment: str, year_end: str,
                  fee_pct: float = 0.0, new_sheet_name: str | None = None,
                  workbook_id: str | None = None) -> ToolOutput:
    """Monthly amortising loan: interest = opening principal × monthly rate, paid in
    arrears with a fixed principal repayment. Interest from the last payment to the
    year end is accrued by days (charge × days used ÷ days in the period)."""
    rate = (monthly_rate_pct if monthly_rate_pct is not None else
            (annual_rate_pct or 0) / 12) / 100
    if principal <= 0 or principal_repayment <= 0 or rate < 0:
        raise ToolError("principal and repayment must be positive")
    start, first, ye = _d(disbursed), _d(first_repayment), _d(year_end)
    rows = []
    bal, k = round(principal, 2), 0
    pay_date = first
    while pay_date <= ye and bal > 0.005:
        interest = round(bal * rate, 2)
        p = min(round(principal_repayment, 2), bal)
        rows.append({"date": pay_date, "opening": bal, "interest": interest, "principal": p,
                     "payment": round(interest + p, 2), "closing": round(bal - p, 2)})
        bal = round(bal - p, 2)
        k += 1
        pay_date = _add_months(first, k)
    last = rows[-1]["date"] if rows else start
    nxt = _add_months(last, 1) if rows else first
    used, period = (ye - last).days, (nxt - last).days
    accrued = round(bal * rate * used / period, 2) if bal > 0 and period > 0 else 0.0
    fee = round(principal * fee_pct / 100, 2)
    interest_paid = round(sum(x["interest"] for x in rows), 2)
    principal_paid = round(sum(x["principal"] for x in rows), 2)
    wb = ctx.workbook(workbook_id) if workbook_id else next(iter(ctx.workbooks.values()))
    b = OpBuilder(wb, "loan_schedule")
    name = b.create_sheet(new_sheet_name or "Loan", "Loan schedule")
    reason = "loan_schedule · from the loan terms"
    b.set(name, "A1", value="Loan schedule", reason=reason, style={"b": True})
    b.set(name, "A2", value=(f"Principal {principal:,.2f} from {start.isoformat()}; "
                             f"{rate * 100:g}% a month; {principal_repayment:,.2f} principal a "
                             f"month from {first.isoformat()}; fee {fee_pct:g}%."), reason=reason)
    b.set(name, "B3", value=rate, number_format="0.00%", reason=reason)
    b.set(name, "A3", value="Monthly rate", reason=reason)
    for i, h in enumerate(("Payment date", "Opening principal", "Interest", "Principal",
                           "Payment", "Closing principal"), start=1):
        b.set(name, a1(5, i), value=h, reason=reason, style=HEAD)
    r = 6
    for i, x in enumerate(rows):
        b.set(name, f"A{r}", value=x["date"].isoformat(), reason=reason)
        b.set(name, f"B{r}", value=x["opening"] if i == 0 else None,
              formula=None if i == 0 else f"=F{r - 1}", number_format=MONEY, reason=reason)
        b.set(name, f"C{r}", formula=f"=ROUND(B{r}*$B$3,2)", number_format=MONEY, reason=reason)
        b.set(name, f"D{r}", value=x["principal"], number_format=MONEY, reason=reason)
        b.set(name, f"E{r}", formula=f"=C{r}+D{r}", number_format=MONEY, reason=reason)
        b.set(name, f"F{r}", formula=f"=B{r}-D{r}", number_format=MONEY, reason=reason)
        r += 1
    end = r - 1
    b.set(name, f"A{r}", value="Total", reason=reason, style=TOTAL)
    for col in "CDE":
        b.set(name, f"{col}{r}", formula=f"=SUM({col}6:{col}{end})", number_format=MONEY,
              reason=reason, style=TOTAL)
    r += 2
    summary_rows = [
        ("Principal at year end", f"=F{end}" if rows else f"={principal}", "closing"),
        (f"Interest accrued {last.isoformat()} to {ye.isoformat()} ({used}/{period} days)",
         f"=ROUND(F{end}*$B$3*{used}/{period},2)" if rows else f"={accrued}", "accrued"),
        ("Management fee", f"={fee}", "fee"),
        ("Finance cost for the year", None, "cost"),
    ]
    refs: dict[str, str] = {}
    for label, f, key in summary_rows:
        b.set(name, f"A{r}", value=label, reason=reason, style=TOTAL if key == "cost" else None)
        if key == "cost":
            f = f"=C{end + 1}+{refs['accrued']}+{refs['fee']}"
        b.set(name, f"B{r}", formula=f, number_format=MONEY, reason=reason,
              style=TOTAL if key == "cost" else None)
        refs[key] = f"B{r}"
        r += 1
    batch = finish_batch(ctx, b, "Loan schedule", f"{name} · {len(rows)} payments")
    data = {"sheet": name, "payments": len(rows), "interest_paid": interest_paid,
            "principal_paid": principal_paid, "principal_at_year_end": bal,
            "accrued_interest": accrued, "fee": fee,
            "finance_cost": round(interest_paid + accrued + fee, 2),
            "accrual_days": f"{used}/{period}",
            "schedule": [{**x, "date": x["date"].isoformat()} for x in rows]}
    return ToolOutput(data=data, batch=batch, citations=[qualify(name, refs["cost"])],
                      summary=(f"Loan: {len(rows)} payments to {ye.isoformat()}, interest paid "
                               f"{interest_paid:,.2f}, principal repaid {principal_paid:,.2f}, "
                               f"principal at year end {bal:,.2f}, interest accrued "
                               f"{accrued:,.2f} ({used}/{period} days), fee {fee:,.2f}."))


# --- depreciation -------------------------------------------------------------------
def depreciation_schedule(ctx: ToolContext, *, year_end: str, sheet: str | None = None,
                          additions: list[dict[str, Any]] | None = None,
                          full_month_in_month_bought: bool = True,
                          new_sheet_name: str | None = None,
                          workbook_id: str | None = None) -> ToolOutput:
    """Straight-line depreciation for the year from a fixed asset register (cost,
    annual rate, date bought, accumulated depreciation b/f), plus additions. A charge
    never takes the net book value below zero."""
    ye = _d(year_end)
    ys = date(ye.year, 1, 1)
    found = None
    for w in ([ctx.workbook(workbook_id)] if workbook_id else ctx.workbooks.values()):
        for sh in w.sheets.values():
            if sheet and sh.name.lower() != sheet.lower():
                continue
            if not sheet and not re.search(r"fixed asset|asset register|\bfar\b", sh.name, re.IGNORECASE):
                continue
            found = (w, sh)
            break
        if found:
            break
    assets: list[dict[str, Any]] = []
    if found:
        w, sh = found
        heads = {str(sh.value(1, c) or "").strip().lower(): c for c in range(1, sh.max_col + 1)}

        def col(*words: str) -> int | None:
            for h, c in heads.items():
                if all(x in h for x in words):
                    return c
            return None
        c_desc, c_date, c_cost = col("description") or 2, col("date"), col("cost")
        c_rate, c_acc = col("rate"), col("accumulated")
        if not (c_date and c_cost and c_rate):
            raise ToolError(f"{sh.name}: need date bought, cost and annual rate columns")
        for r in range(2, sh.max_row + 1):
            cost = to_number(sh.value(r, c_cost))
            if not cost:
                continue
            assets.append({"row": r, "name": str(sh.value(r, c_desc) or ""),
                           "bought": _d(sh.value(r, c_date)), "cost": cost,
                           "rate": to_number(sh.value(r, c_rate)) or 0.0,
                           "acc_bf": to_number(sh.value(r, c_acc)) if c_acc else 0.0,
                           "src": (sh.name, r, c_cost, c_rate, c_acc)})
    else:
        w = ctx.workbook(workbook_id) if workbook_id else next(iter(ctx.workbooks.values()))
    for a in additions or []:
        rate = to_number(a.get("rate"))
        rate = rate / 100 if rate and rate > 1 else rate
        assets.append({"row": None, "name": str(a.get("name") or "Addition"),
                       "bought": _d(a.get("date")), "cost": to_number(a.get("cost")) or 0.0,
                       "rate": rate or 0.0, "acc_bf": 0.0, "src": None})
    if not assets:
        raise ToolError("no fixed asset register found and no additions given")

    def months(bought: date) -> int:
        if bought > ye:
            return 0
        if bought < ys:
            return 12
        return 12 - bought.month + 1 if full_month_in_month_bought else 12 - bought.month

    b = OpBuilder(w, "depreciation_schedule")
    name = b.create_sheet(new_sheet_name or "Fixed assets", "Depreciation schedule")
    reason = "depreciation_schedule · straight line from the register"
    heads = ("Asset", "Date bought", "Cost", "Annual rate", "Months", "Acc. dep. b/f",
             "Charge for the year", "Acc. dep. c/f", "Net book value")
    for i, h in enumerate(heads, start=1):
        b.set(name, a1(1, i), value=h, reason=reason, style=HEAD)
    r = 2
    total = 0.0
    for a in assets:
        m = months(a["bought"])
        charge = min(round(a["cost"] * a["rate"] * m / 12, 2), max(0.0, a["cost"] - a["acc_bf"]))
        total += charge
        src = a["src"]
        cost_f = f"={qualify(src[0], a1(src[1], src[2]))}" if src else None
        rate_f = f"={qualify(src[0], a1(src[1], src[3]))}" if src else None
        acc_f = f"={qualify(src[0], a1(src[1], src[4]))}" if src and src[4] else None
        b.set(name, f"A{r}", value=a["name"], reason=reason)
        b.set(name, f"B{r}", value=a["bought"].isoformat(), reason=reason)
        b.set(name, f"C{r}", value=None if cost_f else a["cost"], formula=cost_f,
              number_format=MONEY, reason=reason)
        b.set(name, f"D{r}", value=None if rate_f else a["rate"], formula=rate_f,
              number_format="0.00%", reason=reason)
        b.set(name, f"E{r}", value=m, reason=reason)
        b.set(name, f"F{r}", value=None if acc_f else a["acc_bf"], formula=acc_f,
              number_format=MONEY, reason=reason)
        b.set(name, f"G{r}", formula=f"=MIN(ROUND(C{r}*D{r}*E{r}/12,2),MAX(0,C{r}-F{r}))",
              number_format=MONEY, reason=reason)
        b.set(name, f"H{r}", formula=f"=F{r}+G{r}", number_format=MONEY, reason=reason)
        b.set(name, f"I{r}", formula=f"=C{r}-H{r}", number_format=MONEY, reason=reason)
        r += 1
    end = r - 1
    b.set(name, f"A{r}", value="Total", reason=reason, style=TOTAL)
    for col in "CFGHI":
        b.set(name, f"{col}{r}", formula=f"=SUM({col}2:{col}{end})", number_format=MONEY,
              reason=reason, style=TOTAL)
    batch = finish_batch(ctx, b, "Depreciation schedule", f"{name} · charge {total:,.2f}")
    data = {"sheet": name, "assets": len(assets), "charge": round(total, 2),
            "by_asset": [{"name": a["name"], "months": months(a["bought"]),
                          "charge": min(round(a["cost"] * a["rate"] * months(a["bought"]) / 12, 2),
                                        max(0.0, a["cost"] - a["acc_bf"]))} for a in assets],
            "total_cell": qualify(name, f"G{r}")}
    return ToolOutput(data=data, batch=batch, citations=[qualify(name, f"G{r}")],
                      summary=f"Depreciation for the year {round(total, 2):,.2f} over "
                              f"{len(assets)} asset(s).")

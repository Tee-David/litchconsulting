"""Year-end review recipe (plan v5, slice C): a fixed, visible plan the engine runs
with no model planning, so a weak, slow or busy model cannot lose the job.

Steps: (1) a Sources sheet (every file: what it is, period, rows, note), (2) a bank
reconciliation for each bank statement, (3) depreciation from the fixed asset
register, (4) review points found by rules, each with its source (suspense, other
income, a VAT account with a debit, large capital items in repairs, personal items,
a loan in income, missing depreciation, stock not moved), (5) the statements and tax
from the trial balance (the adjusted TB when journals exist), (6) a short report.
Journals stay with the person: review points name the fix; posting is a proposal.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any

from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.file_context import ROLES, describe
from litchai.workbench.model import a1, qualify, to_number
from litchai.workbench.ops import OpBuilder
from litchai.workbench.tables import detect_table
from litchai.workbench.trial_balance import detect_trial_balance, map_account

YEAR_END = re.compile(r"\b(year[\s-]*end|final accounts|closing the books|adjustments? (required|needed)|"
                      r"review (the|this) (trial balance|tb|books))\b", re.IGNORECASE)
CAPITAL = re.compile(r"\b(motors?|vehicle|van|truck|bus|generator|machine|equipment|laptop|"
                     r"furniture|building|land|cfao|toyota|innoson)\b", re.IGNORECASE)
PERSONAL = re.compile(r"\b(school\b.*\bfees?|fees?\b.*\b(children|child|son|daughter)|tuition|"
                      r"personal|director'?s? (house|family|wife|child))\b", re.IGNORECASE)
LOANISH = re.compile(r"\b(loan disburse|term loan|loan credit|facility)\b", re.IGNORECASE)


def wants_year_end(message: str) -> bool:
    return bool(YEAR_END.search(message))


def _year_end(ctx: ToolContext) -> date:
    m = re.search(r"(20\d{2})", ctx.period_label or "")
    return date(int(m.group(1)), 12, 31) if m else date(date.today().year - 1, 12, 31)


def sources_sheet(ctx: ToolContext, refs: list[Any] | None = None) -> ToolOutput:
    refs = refs if refs is not None else ctx.memory.get("refs") or []
    tb = detect_trial_balance(ctx, skip_adjusted=True)
    wb = tb.workbook if tb else ctx.workbook()
    b = OpBuilder(wb, "year_end_review")
    name = b.create_sheet("Sources", "Every file in this job")
    reason = "year_end_review · sources"
    for i, h in enumerate(("File", "What it is", "Period", "Rows", "Note"), start=1):
        b.set(name, a1(1, i), value=h, reason=reason, style={"b": True, "bg": "E8EEF7"})
    for r, ref in enumerate(refs, start=2):
        m = ctx.workbooks.get(ref.id)
        f = ref.facts or (describe(m, ref.name) if m else {})
        role = ref.role or f.get("role") or "other"
        label = ROLES.get(role, role) + (f" ({f['bank']})" if f.get("bank") else "")
        b.set(name, f"A{r}", value=ref.name, reason=reason)
        b.set(name, f"B{r}", value=label, reason=reason)
        b.set(name, f"C{r}", value=" to ".join(f.get("period") or []) or None, reason=reason)
        b.set(name, f"D{r}", value=f.get("rows") or None, reason=reason)
        b.set(name, f"E{r}", value=(ref.note or "") + (f" (from {ref.group})" if ref.group else ""),
              reason=reason)
    batch = finish_batch(ctx, b, "Sources: every file in this job", f"{len(refs)} files")
    return ToolOutput(data={"files": len(refs)}, batch=batch,
                      summary=f"Sources sheet lists {len(refs)} file(s).")


def review_points_tool(ctx: ToolContext) -> ToolOutput:
    pts = review_points(ctx)
    return ToolOutput(data={"points": pts, "count": len(pts)},
                      summary=f"{len(pts)} review point(s) found by rules.",
                      citations=[p["source"] for p in pts if "!" in p["source"]][:20])


def review_points(ctx: ToolContext) -> list[dict[str, str]]:
    """Rules only. Each point: what, why, the fix, and the source."""
    tb = detect_trial_balance(ctx, skip_adjusted=True)
    if tb is None:
        raise ToolError("no trial balance found")
    pts: list[dict[str, str]] = []
    src = tb.sheet.name
    rev = sum(a.credit - a.debit for a in tb.accounts if map_account(a)[0] == "revenue")

    def cell(a: Any) -> str:
        return qualify(src, a1(a.row, tb.debit_col or tb.balance_col))

    for a in tb.accounts:
        n = a.name.lower()
        bal = a.debit - a.credit
        if "suspense" in n and abs(bal) > 0.5:
            pts.append({"what": f"Suspense {abs(bal):,.2f}", "source": cell(a),
                        "fix": "Find what is inside it (often transfers between own banks) and clear it."})
        if "other income" in n and -bal > max(0.05 * rev, 1):
            pts.append({"what": f"Other income {-bal:,.2f} ({-bal / rev:.0%} of revenue)" if rev else
                        f"Other income {-bal:,.2f}", "source": cell(a),
                        "fix": "Check for loan proceeds, transfers between own banks or capital "
                               "receipts booked as income."})
        if "vat" in n and "payable" in n and bal > 0.5:
            pts.append({"what": f"VAT payable shows a debit of {bal:,.2f}", "source": cell(a),
                        "fix": "VAT is likely still inside revenue and costs. Rebuild the VAT "
                               "account: output VAT less input VAT less payments."})
        if re.search(r"finance cost|interest", n) and bal > 0 and not any(
                re.search(r"loan|borrowing", x.name, re.IGNORECASE) for x in tb.accounts):
            pts.append({"what": f"Finance cost {bal:,.2f} with no loan account", "source": cell(a),
                        "fix": "Repayments may be booked whole as finance cost: split principal "
                               "and interest with a loan schedule."})
    names = " ".join(a.name.lower() for a in tb.accounts)
    has_dep = "depreciation" in names and any(
        "depreciation" in a.name.lower() and a.debit > 0 for a in tb.accounts)
    register = any(re.search(r"fixed asset|asset register", s, re.IGNORECASE)
                   for w in ctx.workbooks.values() for s in w.sheets)
    if register and not has_dep:
        pts.append({"what": "No depreciation charge for the year", "source": "Fixed asset register",
                    "fix": "Post the depreciation from the register (and for assets bought "
                           "this year)."})
    for w in ctx.workbooks.values():
        if "opening balances" in {s.lower() for s in w.sheets}:
            ob = next(s for n, s in w.sheets.items() if n.lower() == "opening balances")
            for a in tb.accounts:
                if re.search(r"inventor|stock", a.name, re.IGNORECASE):
                    for r in range(2, ob.max_row + 1):
                        if str(ob.value(r, 1) or "") == a.code and \
                                abs((to_number(ob.value(r, 3)) or 0) - a.debit) < 0.5:
                            pts.append({"what": f"Inventory {a.debit:,.2f} is the opening figure",
                                        "source": cell(a),
                                        "fix": "Post closing stock from the stock count."})
    # Statement lines: capital items, personal items, loans.
    for w in ctx.workbooks.values():
        for sh in w.sheets.values():
            t = detect_table(sh)
            if t is None or t.col("balance") is None or t.col("date") is None:
                continue
            d, c, desc = t.col("debit"), t.col("credit"), t.col("description")
            if not desc:
                continue
            for r in range(t.first_row, t.last_row + 1):
                text = str(sh.value(r, desc.index) or "")
                out = to_number(sh.value(r, d.index)) if d else None
                inn = to_number(sh.value(r, c.index)) if c else None
                where = f"{w.name} row {r}"
                if out and out >= 5_000_000 and CAPITAL.search(text):
                    pts.append({"what": f"{text[:50]}: {out:,.2f} paid", "source": where,
                                "fix": "Likely a fixed asset: capitalise and depreciate it if it "
                                       "was booked as an expense."})
                elif out and PERSONAL.search(text):
                    pts.append({"what": f"{text[:50]}: {out:,.2f}", "source": where,
                                "fix": "A personal item is not a company cost: charge the "
                                       "director's current account."})
                elif inn and LOANISH.search(text):
                    pts.append({"what": f"{text[:50]}: {inn:,.2f} received", "source": where,
                                "fix": "A loan is a liability, not income: recognise it and "
                                       "make a loan schedule."})
    # Bank charges on a statement, but no bank-charges account in the books.
    if not any(re.search(r"bank charge|charges", a.name, re.IGNORECASE) for a in tb.accounts):
        from litchai.workbench.bankrec import CHARGE

        for w in ctx.workbooks.values():
            for sh in w.sheets.values():
                t = detect_table(sh)
                if t is None or t.col("balance") is None:
                    continue
                d, desc = t.col("debit"), t.col("description")
                if not (d and desc):
                    continue
                tot = sum(to_number(sh.value(r, d.index)) or 0 for r in range(t.first_row, t.last_row + 1)
                          if CHARGE.search(str(sh.value(r, desc.index) or "")))
                if tot:
                    cur = "USD " if re.search(r"usd|dollar", w.name + " ".join(
                        c.name for c in t.columns), re.IGNORECASE) else ""
                    pts.append({"what": f"Bank charges of {cur}{tot:,.2f} on {w.name} are not "
                                        "in the books (no bank charges account)",
                                "source": w.name,
                                "fix": "Post them as bank charges (translate foreign-currency "
                                       "charges at the rate on the day)."})
    return pts[:30]


def year_end_steps(ctx: ToolContext, refs: list[Any]) -> list[tuple[str, dict[str, Any]]]:
    """The plan: tool name + arguments, in order."""
    steps: list[tuple[str, dict[str, Any]]] = []
    if len(refs) > 1:
        steps.append(("sources_sheet", {}))
    seen = set()
    for ref in refs:
        f = ref.facts or {}
        if (ref.role or f.get("role")) == "bank_statement":
            key = f.get("bank") or ref.name
            if key not in seen:
                seen.add(key)
                steps.append(("bank_rec", {"statement": f.get("bank") or ref.name.split("_")[0]}))
    if any(re.search(r"fixed asset|asset register", s, re.IGNORECASE)
           for w in ctx.workbooks.values() for s in w.sheets):
        steps.append(("depreciation_schedule", {"year_end": _year_end(ctx).isoformat()}))
    steps.append(("review_points", {}))
    steps.append(("trial_balance_statements", {}))
    steps.append(("tax_compute", {"kind": "cit"}))
    return steps

"""Standard payroll-audit checks (edge-case suite, 19 Nov). Rules on column meanings:

- names paid that are not in the staff master (ghost employees), and one bank
  account paid for more than one name;
- staff paid after their exit date;
- the same person paid twice in one month;
- no pension deducted where the others have it;
- PAYE recomputed under the NTA 2025 bands in the tax config (with the employee
  pension relief) against the PAYE deducted;
- payroll gross against salaries in the trial balance.

Read only. Each finding has the amount, the source and the fix.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date, datetime
from typing import Any

from litchai.workbench.context import ToolContext, ToolOutput
from litchai.workbench.model import to_number
from litchai.workbench.tables import Table, detect_table


def _col(t: Table, pat: str, avoid: str | None = None) -> int | None:
    for c in t.columns:
        if re.search(pat, c.name, re.IGNORECASE) and not (avoid and re.search(avoid, c.name, re.IGNORECASE)):
            return c.index
    return None


def _m(x: float) -> str:
    return f"{x:,.2f}"


def _month_end(m: str) -> date | None:
    mm = re.match(r"^(\d{4})-(\d{2})", str(m))
    if not mm:
        return None
    y, n = int(mm[1]), int(mm[2])
    return date(y + (n == 12), n % 12 + 1, 1)


def payroll_checks(ctx: ToolContext) -> ToolOutput:
    from litchai.taxconfig import load_tax_config
    from litchai.workbench.analysis import paye_annual

    cfg = load_tax_config()
    pen_rate = cfg["payroll"]["pension"]["employeePct"] / 100
    findings: list[dict[str, Any]] = []
    pay: list[dict[str, Any]] = []
    master: dict[str, dict[str, Any]] = {}
    gl_salaries = None
    for wb in ctx.workbooks.values():
        for sh in wb.sheets.values():
            t = detect_table(sh)
            if t is None or t.n_rows == 0:
                continue
            rows = range(t.first_row, t.last_row + 1)
            heads = " ".join(c.name.lower() for c in t.columns)
            if "account name" in heads and ("debit" in heads or "credit" in heads):
                n_c, d_c, c_c = _col(t, "account name"), _col(t, "^debit"), _col(t, "^credit")
                for r in rows:
                    if re.search(r"salar|wage", str(sh.value(r, n_c) or ""), re.IGNORECASE):
                        gl_salaries = (to_number(sh.value(r, d_c)) or 0) - (to_number(sh.value(r, c_c)) or 0)
                continue
            id_c = _col(t, r"staff id|employee id|emp(loyee)? no|^id$")
            name_c = _col(t, r"^name|employee name|staff name")
            acct_c = _col(t, r"account (no|number)|acct")
            gross_c = _col(t, r"gross")
            if not (name_c and gross_c):
                continue
            month_c = _col(t, r"month|period|pay date")
            if month_c and _col(t, r"paye|tax"):
                pen_c = _col(t, r"pension")
                tax_c = _col(t, r"paye|tax")
                for r in rows:
                    pay.append({"row": r, "month": str(sh.value(r, month_c) or ""),
                                "id": str(sh.value(r, id_c) or "") if id_c else "",
                                "name": str(sh.value(r, name_c) or ""),
                                "account": str(sh.value(r, acct_c) or "") if acct_c else "",
                                "gross": to_number(sh.value(r, gross_c)) or 0.0,
                                "pension": (to_number(sh.value(r, pen_c)) or 0.0) if pen_c else 0.0,
                                "paye": to_number(sh.value(r, tax_c)) or 0.0,
                                "where": wb.name})
            else:
                exit_c = _col(t, r"exit|left|termination|leav")
                for r in rows:
                    key = str(sh.value(r, id_c) or "") if id_c else str(sh.value(r, name_c))
                    ex = sh.value(r, exit_c) if exit_c else None
                    master[key] = {"name": str(sh.value(r, name_c) or ""),
                                   "exit": ex.date() if isinstance(ex, datetime) else ex}
    if not pay:
        return ToolOutput(data={"findings": []}, summary="No payroll register found.")
    where = pay[0]["where"]
    # ghosts and shared accounts
    if master:
        ghosts = [p for p in pay if (p["id"] or p["name"]) not in master
                  and p["name"] not in {m["name"] for m in master.values()}]
        if ghosts:
            tot = sum(p["gross"] for p in ghosts)
            who = sorted({f"{p['id']} {p['name']}".strip() for p in ghosts})
            findings.append({"check": "not_in_staff_master", "amount": round(tot, 2),
                             "what": f"Paid but not in the staff master: {', '.join(who[:5])} "
                                     f"({_m(tot)} gross)",
                             "fix": "Stop the payments and investigate (possible ghost employee).",
                             "source": where})
    by_acct: dict[str, set[str]] = defaultdict(set)
    for p in pay:
        if p["account"]:
            by_acct[p["account"]].add(f"{p['id']} {p['name']}".strip())
    shared = {a: n for a, n in by_acct.items() if len(n) > 1}
    if shared:
        a, names = next(iter(shared.items()))
        tot = sum(p["gross"] for p in pay if p["account"] in shared)
        findings.append({"check": "shared_bank_account", "amount": round(tot, 2),
                         "what": f"One bank account is paid for more than one name: account "
                                 f"{a} for {', '.join(sorted(names))}",
                         "fix": "Confirm each person's own account; a shared account is a "
                                "ghost-employee sign.", "source": where})
    # paid after exit
    late = []
    for p in pay:
        m = master.get(p["id"]) or next((x for x in master.values() if x["name"] == p["name"]), None)
        end = _month_end(p["month"])
        first = date(int(p["month"][:4]), int(p["month"][5:7]), 1) if end else None
        if m and isinstance(m.get("exit"), date) and first and first > m["exit"]:
            late.append(p)  # paid for a month that starts after the exit date
    if late:
        tot = sum(p["gross"] for p in late)
        who = sorted({f"{p['id']} {p['name']}".strip() for p in late})
        findings.append({"check": "paid_after_exit", "amount": round(tot, 2),
                         "what": f"Paid after the exit date: {', '.join(who)} ({len(late)} "
                                 f"month(s), {_m(tot)})",
                         "fix": "Stop the payments; recover them from the bank or the person.",
                         "source": where})
    # paid twice in a month
    cnt = Counter((p["month"], p["id"] or p["name"]) for p in pay)
    twice = [(m, k) for (m, k), n in cnt.items() if n > 1]
    if twice:
        tot = sum(next(p["gross"] for p in pay if (p["month"], p["id"] or p["name"]) == t)
                  * (cnt[t] - 1) for t in twice)
        findings.append({"check": "paid_twice", "amount": round(tot, 2),
                         "what": "Paid twice in the same month: " + ", ".join(f"{k} in {m}" for m, k in twice[:5])
                                 + f" ({_m(tot)})", "fix": "Recover the extra payment.",
                         "source": where})
    # pension missing
    with_pen = sum(1 for p in pay if p["pension"] > 0)
    if with_pen >= len(pay) / 2:
        nop = [p for p in pay if p["pension"] == 0 and p["gross"] > 0]
        if nop:
            due = sum(p["gross"] * pen_rate for p in nop)
            who = sorted({f"{p['id']} {p['name']}".strip() for p in nop})
            findings.append({"check": "pension_not_deducted", "amount": round(due, 2),
                             "what": f"No pension deducted for {', '.join(who[:5])} "
                                     f"({_m(due)} at {pen_rate:.0%})",
                             "fix": "Deduct and remit the employee pension (and the employer "
                                    "share); pay the arrears.", "source": where})
    # PAYE under the NTA 2025 bands
    gap, n = 0.0, 0
    ghost_keys = {f"{p['id']} {p['name']}".strip() for f in findings
                  if f["check"] == "not_in_staff_master" for p in pay
                  if f"{p['id']} {p['name']}".strip() in f["what"]}
    seen_pay: set[tuple[str, str]] = set()
    for p in pay:
        key = (p["month"], p["id"] or p["name"])
        if key in seen_pay or f"{p['id']} {p['name']}".strip() in ghost_keys:
            continue  # a second payment or a ghost: not a real pay line for PAYE
        seen_pay.add(key)
        if p["pension"] == 0 or p["gross"] <= 0:
            continue
        tax, _ = paye_annual(cfg, max(0.0, (p["gross"] - p["pension"]) * 12))
        ok = round(tax / 12, 2)
        if abs(ok - p["paye"]) > 1:
            gap += ok - p["paye"]
            n += 1
    if n:
        word = "under-deducted" if gap > 0 else "over-deducted"
        findings.append({"check": "paye_wrong_rules", "amount": round(abs(gap), 2),
                         "what": f"PAYE differs from the NTA 2025 bands on {n} pay line(s): "
                                 f"{_m(abs(gap))} {word} in total",
                         "fix": "Update the payroll to the tax config bands; settle the "
                                "difference with the tax authority (or refund staff).",
                         "source": where})
    # payroll vs books
    if gl_salaries is not None:
        total = sum(p["gross"] for p in pay)
        diff = total - gl_salaries
        if abs(diff) > 1:
            months = Counter(p["month"] for p in pay)
            by_m = {m: sum(p["gross"] for p in pay if p["month"] == m) for m in months}
            hits = sorted(m for m, g in by_m.items() if abs(g - diff) < 1)
            note = (f": the {hits[0]} payroll is not posted" if len(hits) == 1 else
                    f": the gap equals one month's payroll ({' or '.join(hits)}); check which "
                    "month is not posted" if hits else "")
            findings.append({"check": "payroll_vs_books", "amount": round(diff, 2),
                             "what": f"Payroll gross is {_m(total)} but salaries in the trial "
                                     f"balance are {_m(gl_salaries)}" + note,
                             "fix": "Post the missing payroll journal (gross, PAYE, pension, "
                                    "net pay).", "source": "trial balance"})
    summary = (f"{len(findings)} payroll finding(s):\n"
               + "\n".join(f"- {f['what']}. Fix: {f['fix']}" for f in findings)) if findings \
        else "No payroll findings from the standard checks."
    return ToolOutput(data={"findings": findings}, summary=summary)

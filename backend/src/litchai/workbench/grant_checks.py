"""Standard grant (restricted funds) checks for NGOs and donor projects (edge-case
suite, 19 Nov). Rules on the grant agreement text and on column meanings:

- spending the agreement does not allow (alcohol, entertainment, gifts, fines, personal);
- spending that belongs to another grant's purpose (education costs on a health grant);
- staff costs charged above the share in the timesheets;
- restricted income not yet spent at the year end (deferred, not income);
- a tranche the agreement gives for a later year, booked as this year's income;
- a foreign-currency receipt translated at another rate than the official rate on the day.

Read only. Each finding has the amount, the source and the fix.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from litchai.workbench.context import ToolContext, ToolOutput
from litchai.workbench.model import to_number
from litchai.workbench.tables import Table, detect_table

INELIGIBLE = re.compile(r"alcohol|drinks?\b|party|entertain|gift|fine\b|penalt|personal|"
                        r"donation to (a )?(politic|official)", re.IGNORECASE)
DOMAINS = {
    "health": re.compile(r"malaria|clinic|health|nets?\b|medical|drug|vaccin|nurse|hospital",
                         re.IGNORECASE),
    "education": re.compile(r"school|pupil|teacher|education|reading|books?\b|classroom|student",
                            re.IGNORECASE),
    "water": re.compile(r"borehole|water|sanitation|wash\b|latrine", re.IGNORECASE),
    "agriculture": re.compile(r"farm|seed|fertili[sz]er|crop|livestock", re.IGNORECASE),
}
STAFF = re.compile(r"salar|wage|staff cost|payroll|stipend", re.IGNORECASE)


def _m(x: float) -> str:
    return f"{x:,.2f}"


def _col(t: Table, pat: str) -> int | None:
    for c in t.columns:
        if re.search(pat, c.name, re.IGNORECASE):
            return c.index
    return None


def _text(ctx: ToolContext) -> str:
    """The text of document files (agreements, letters) in this job."""
    out = []
    for wb in ctx.workbooks.values():
        cells = [c.value for s in wb.sheets.values()
                 for _, c in sorted(s.cells.items()) if isinstance(c.value, str)]
        if cells and sum(len(x) > 40 for x in cells) >= 3:
            out.append("\n".join(cells))  # one line per row: grant headers stay on their own line
    return "\n".join(out)


def _domain(text: str) -> str | None:
    hits = {d: len(p.findall(text)) for d, p in DOMAINS.items()}
    best = max(hits, key=hits.get)
    return best if hits[best] else None


def _date(v: Any) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", str(v or "").strip())
    return date(int(m[3]), int(m[2]), int(m[1])) if m else None


def grant_checks(ctx: ToolContext) -> ToolOutput:
    findings: list[dict[str, Any]] = []
    agreement = _text(ctx)
    # grant codes and their purposes, from "<CODE>-<year>" ids in the agreements
    grants: dict[str, dict[str, Any]] = {}
    code_at = [(m.start(), m[1]) for m in re.finditer(r"\b([A-Z]{2,4})-20\d\d(?:-\d+)?\b", agreement)]
    for i, (pos, code) in enumerate(code_at):
        if code in grants:
            continue
        line_start = agreement.rfind("\n", 0, pos) + 1
        nxt = next((p for p, c in code_at[i + 1:] if c != code), len(agreement))
        block = agreement[line_start:agreement.rfind("\n", 0, nxt) + 1 or nxt]
        grants[code] = {"text": block, "domain": _domain(block)}
    spend: list[dict[str, Any]] = []
    shares: dict[str, dict[str, float]] = {}
    fx_rates: list[tuple[date, float]] = []
    usd_in: list[tuple[date, float, str]] = []
    tb: list[tuple[str, float]] = []
    for wb in ctx.workbooks.values():
        for sh in wb.sheets.values():
            t = detect_table(sh)
            if t is None or t.n_rows == 0:
                continue
            rows = range(t.first_row, t.last_row + 1)
            heads = " ".join(c.name.lower() for c in t.columns)
            if "account name" in heads and "credit" in heads:
                n_c, c_c, d_c = _col(t, "account name"), _col(t, "^credit"), _col(t, "^debit")
                tb += [(str(sh.value(r, n_c) or ""), (to_number(sh.value(r, c_c)) or 0)
                        - (to_number(sh.value(r, d_c)) or 0)) for r in rows]
                continue
            g_c = _col(t, r"grant|project|fund code|donor")
            a_c = _col(t, r"activity|description|narration|item")
            amt_c = _col(t, r"amount|value|cost")
            if g_c and a_c and amt_c:
                for r in rows:
                    spend.append({"grant": str(sh.value(r, g_c) or "").strip(),
                                  "activity": str(sh.value(r, a_c) or ""),
                                  "amount": to_number(sh.value(r, amt_c)) or 0.0,
                                  "where": f"{wb.name} row {r}"})
                continue
            pct_cols = [c for c in t.columns if "%" in c.name]
            staff_c = _col(t, r"staff|name|employee")
            role_c = _col(t, r"role|title|position")
            if pct_cols and staff_c:
                for r in rows:
                    who = f"{sh.value(r, staff_c)} {sh.value(r, role_c) or ''}".lower()
                    shares[who] = {c.name.split("%")[0].strip().upper():
                                   (to_number(sh.value(r, c.index)) or 0) / 100 for c in pct_cols}
                continue
            if "rate" in heads and _col(t, r"date"):
                rc, dc = _col(t, r"rate"), _col(t, r"date")
                fx_rates += [(d, to_number(sh.value(r, rc)) or 0) for r in rows
                             if (d := _date(sh.value(r, dc)))]
                continue
            if "usd" in heads and _col(t, r"credit"):
                cc, dc, nc = _col(t, r"credit"), _col(t, r"date"), _col(t, r"narration|description")
                for r in rows:
                    v = to_number(sh.value(r, cc))
                    if v and (d := _date(sh.value(r, dc))):
                        usd_in.append((d, v, str(sh.value(r, nc) or "")))
    # ineligible and misallocated spending
    for code, g in grants.items():
        lines = [s for s in spend if s["grant"].upper() == code]
        bad = [s for s in lines if INELIGIBLE.search(s["activity"])]
        if bad and re.search(r"not allowed|ineligible|not eligible|prohibit", g["text"], re.IGNORECASE):
            tot = sum(s["amount"] for s in bad)
            findings.append({"check": "ineligible_costs", "amount": round(tot, 2),
                             "what": f"{code}: costs the agreement does not allow, {_m(tot)} ("
                                     + "; ".join(s["activity"] for s in bad[:4]) + ")",
                             "fix": "Move them to unrestricted funds; the donor may ask for a "
                                    "refund.", "source": bad[0]["where"]})
        if g["domain"]:
            other = [s for s in lines if not STAFF.search(s["activity"])
                     and (d := _domain(s["activity"])) and d != g["domain"]]
            if other:
                tot = sum(s["amount"] for s in other)
                findings.append({"check": "wrong_grant", "amount": round(tot, 2),
                                 "what": f"{code} is a {g['domain']} grant, but {_m(tot)} of "
                                         f"{_domain(other[0]['activity'])} costs are charged to it ("
                                         + "; ".join(s["activity"] for s in other[:3]) + ")",
                                 "fix": "Charge them to the grant they belong to.",
                                 "source": other[0]["where"]})
        # staff costs vs timesheets
        for s in lines:
            if not STAFF.search(s["activity"]):
                continue
            # the ONE timesheet row that fits best (most shared words), never every match
            act = s["activity"].lower()
            scored = sorted(((sum(w in act for w in re.findall(r"[a-z]{4,}", who)), who)
                             for who in shares), reverse=True)
            if not scored or scored[0][0] == 0 or (len(scored) > 1 and scored[1][0] == scored[0][0]):
                continue
            who = scored[0][1]
            sh_ = shares[who]
            if code in sh_:
                allowed = s["amount"] * sh_[code]
                if s["amount"] - allowed > 0.5:
                    findings.append({"check": "staff_cost_over_timesheet",
                                     "amount": round(s["amount"] - allowed, 2),
                                     "what": f"{code}: {s['activity']} charged in full "
                                             f"({_m(s['amount'])}); the timesheet gives "
                                             f"{sh_[code]:.0%} to this grant",
                                     "fix": "Charge only the timesheet share; the rest to "
                                            "the other grants or core costs.",
                                     "source": s["where"]})
    # later-year tranches
    for m in re.finditer(r"(NGN|USD)\s?([\d,]+(?:\.\d+)?)\)?,? (?:paid in [A-Za-z]+ 20\d\d, )?is for "
                         r"(20\d\d) activities", agreement, re.IGNORECASE):
        amt = float(m[2].replace(",", ""))
        findings.append({"check": "later_year_tranche", "amount": amt,
                         "what": f"A tranche of {m[1]} {_m(amt)} is for {m[3]} activities",
                         "fix": f"If it was booked as income now, defer it to {m[3]}.",
                         "source": "grant agreement"})
    # foreign-currency receipt rate, and unspent restricted funds
    for d, usd, narr in usd_in:
        if not re.search(r"grant|fund|donor", narr, re.IGNORECASE):
            continue
        on_day = next((r for dd, r in sorted(fx_rates) if dd == d), None)
        booked = next((v for n, v in tb if re.search(r"grant income", n, re.IGNORECASE)
                       and v > 0 and re.search(r"usd|global|health", n + narr, re.IGNORECASE)), None)
        if on_day and booked:
            used = booked / usd
            if abs(used - on_day) > 1:
                findings.append({"check": "fx_rate", "amount": round(usd * on_day - booked, 2),
                                 "what": f"USD {_m(usd)} received {d} was booked at about "
                                         f"{used:,.0f}; the official rate that day was "
                                         f"{on_day:,.0f}", "fix": "Translate at the official "
                                         "rate on the date of receipt (as the agreement says).",
                                 "source": "USD statement and FX rates"})
                if re.search(r"unspent|carried forward|restricted", agreement, re.IGNORECASE):
                    code = next((c for c, g in grants.items()
                                 if re.search(r"usd", g["text"], re.IGNORECASE)), None)
                    if code:
                        bad = {"ineligible_costs", "wrong_grant", "staff_cost_over_timesheet"}
                        spent = sum(s["amount"] for s in spend if s["grant"].upper() == code)
                        less = sum(f["amount"] for f in findings if f["check"] in bad
                                   and f["what"].startswith(code))
                        unspent = usd * on_day - (spent - less)
                        findings.append({"check": "restricted_unspent", "amount": round(unspent, 2),
                                         "what": f"{code}: of {_m(usd * on_day)} received, eligible "
                                                 f"spend is {_m(spent - less)}; {_m(unspent)} is "
                                                 "unspent restricted funds",
                                         "fix": "Show only the eligible spend as income this "
                                                "year; defer the unspent balance.",
                                         "source": "agreement, spend ledger"})
    # Plain sentences (what a person reads, also in the model-free fallback answer).
    summary = (f"{len(findings)} grant finding(s):\n"
               + "\n".join(f"- {f['what']}. Fix: {f['fix']}" for f in findings)) if findings \
        else "No grant findings from the standard checks."
    return ToolOutput(data={"findings": findings, "grants": {k: v["domain"] for k, v in grants.items()}},
                      summary=summary)

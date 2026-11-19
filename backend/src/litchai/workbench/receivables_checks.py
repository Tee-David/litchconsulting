"""Standard receivables and contract checks (edge-case suite, 19 Nov). Rules on column
meanings and sheet names, never on one client's files:

- invoice numbers posted more than once;
- invoices with no VAT where the other invoices carry VAT;
- advances, mobilisation or deposits billed as revenue (a liability until work is done);
- a client's WHT rate that differs from the other clients' or from the tax config;
- WHT deducted with no credit note received;
- retention held by clients with no retention account in the trial balance;
- contracts billed ahead of the certified work (over-billing);
- materials on site at the year end (inventory or work in progress, not cost).

Read only: each finding has the amount, the source and the fix.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

from litchai.workbench.context import ToolContext, ToolOutput
from litchai.workbench.model import Sheet, to_number
from litchai.workbench.tables import Table, detect_table

ADVANCE = re.compile(r"advance|mobili[sz]ation|deposit|down.?payment|prepay", re.IGNORECASE)


def _col(t: Table, *pats: str, avoid: str | None = None) -> int | None:
    for c in t.columns:
        n = c.name.lower()
        if any(re.search(p, n) for p in pats) and not (avoid and re.search(avoid, n)):
            return c.index
    return None


def _num(sh: Sheet, r: int, c: int | None) -> float:
    return (to_number(sh.value(r, c)) or 0.0) if c else 0.0


def _m(x: float) -> str:
    return f"{x:,.2f}"


def receivables_checks(ctx: ToolContext) -> ToolOutput:
    from litchai.taxconfig import load_tax_config

    vat_rate = load_tax_config()["vat"]["standardRatePct"] / 100
    findings: list[dict[str, Any]] = []
    invoices: list[dict[str, Any]] = []
    receipts: list[dict[str, Any]] = []
    credit_notes: dict[str, float] = defaultdict(float)
    contracts: list[dict[str, Any]] = []
    tb_names = ""
    for wb in ctx.workbooks.values():
        for sh in wb.sheets.values():
            t = detect_table(sh)
            if t is None or t.n_rows == 0:
                continue
            where = f"{wb.name} / {sh.name}"
            label = f"{wb.name} {sh.name}".lower()
            heads = " ".join(c.name.lower() for c in t.columns)
            rows = range(t.first_row, t.last_row + 1)
            if "account name" in heads and ("debit" in heads or "credit" in heads):
                name_c = _col(t, r"account name")
                tb_names += " ".join(str(sh.value(r, name_c) or "") for r in rows).lower()
                continue
            inv_c = _col(t, r"invoice (no|number|#)|^invoice$")
            client_c = _col(t, r"client|customer|debtor|payer")
            if "credit note" in label and client_c:
                amt_c = _col(t, r"wht|amount")
                for r in rows:
                    credit_notes[str(sh.value(r, client_c))] += _num(sh, r, amt_c)
                continue
            if "on site" in label or "materials" in sh.name.lower():
                v_c = _col(t, r"value|cost|amount")
                tot = sum(_num(sh, r, v_c) for r in rows)
                if tot:
                    findings.append({"check": "materials_on_site", "amount": round(tot, 2),
                                     "what": f"Materials on site at the year end: {_m(tot)}",
                                     "fix": "Carry them as inventory or work in progress, not "
                                            "as cost of sales.", "source": where})
                continue
            cert_c = _col(t, r"certified|complete|progress")
            value_c = _col(t, r"contract value|value")
            if cert_c and value_c and _col(t, r"contract"):
                id_c = _col(t, r"^contract$|contract (no|id)")
                for r in rows:
                    pct = _num(sh, r, cert_c)
                    contracts.append({"id": str(sh.value(r, id_c)), "value": _num(sh, r, value_c),
                                      "certified": pct / 100 if pct > 1 else pct,
                                      "client": str(sh.value(r, client_c) or "")})
                continue
            wht_c = _col(t, r"\bwht\b|withholding")
            if wht_c and client_c:  # receipts
                tot_c = _col(t, r"invoice total|gross|amount", avoid=r"net|wht|retention")
                ret_c = _col(t, r"retention")
                rinv_c = _col(t, r"invoice")
                for r in rows:
                    receipts.append({"client": str(sh.value(r, client_c)), "total": _num(sh, r, tot_c),
                                     "invoice": str(sh.value(r, rinv_c) or "") if rinv_c else "",
                                     "wht": _num(sh, r, wht_c), "retention": _num(sh, r, ret_c),
                                     "where": where})
                continue
            if inv_c:
                # "Amount (excl VAT)" is the amount; "VAT" and "Total" are not.
                amt_c = _col(t, r"amount|excl|\bnet\b", avoid=r"incl|total|^vat$")
                vat_c = _col(t, r"^vat$|vat amount|\bvat\b", avoid=r"incl|excl")
                type_c = _col(t, r"type|description|narration")
                con_c = _col(t, r"^contract")
                for r in rows:
                    invoices.append({"no": str(sh.value(r, inv_c)), "amount": _num(sh, r, amt_c),
                                     "vat": _num(sh, r, vat_c) if vat_c else None,
                                     "type": str(sh.value(r, type_c) or "") if type_c else "",
                                     "client": str(sh.value(r, client_c) or "") if client_c else "",
                                     "contract": str(sh.value(r, con_c) or "") if con_c else "",
                                     "where": where})
    # duplicate invoice numbers
    counts = Counter(i["no"] for i in invoices if i["no"] not in ("", "None"))
    dups = [n for n, k in counts.items() if k > 1]
    if dups:
        extra = sum(i["amount"] for n in dups for i in [x for x in invoices if x["no"] == n][1:])
        findings.append({"check": "duplicate_invoices", "amount": round(extra, 2),
                         "what": f"Invoice number(s) posted more than once: {', '.join(dups[:6])} "
                                 f"({_m(extra)} extra)",
                         "fix": "Reverse the second posting.", "source": invoices[0]["where"]})
    # VAT missing on some invoices
    with_vat = [i for i in invoices if i["vat"] is not None]
    if with_vat and sum(1 for i in with_vat if i["vat"] > 0) >= len(with_vat) / 2:
        nov = [i for i in with_vat if i["vat"] == 0 and i["amount"] > 0]
        if nov:
            due = sum(i["amount"] * vat_rate for i in nov)
            who = sorted({i["client"] or i["contract"] for i in nov})[:4]
            findings.append({"check": "vat_not_charged", "amount": round(due, 2),
                             "what": f"{len(nov)} invoice(s) carry no VAT ({', '.join(who)}); "
                                     f"VAT at {vat_rate:.1%} would be {_m(due)}",
                             "fix": "Unless the supply is exempt, charge VAT (or account for "
                                    "it from the amount received) and declare it.",
                             "source": nov[0]["where"]})
    # advances billed as revenue
    adv = [i for i in invoices if ADVANCE.search(i["type"])]
    if adv:
        tot = sum(i["amount"] for i in adv)
        findings.append({"check": "advance_as_revenue", "amount": round(tot, 2),
                         "what": f"Advance or mobilisation billing of {_m(tot)} "
                                 f"({', '.join(sorted({i['contract'] or i['no'] for i in adv}))})",
                         "fix": "Until the work is done it is a contract liability (customer "
                                "advance), not revenue.", "source": adv[0]["where"]})
    # WHT rate per client
    by_client: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    inv_amount = {i["no"]: i["amount"] for i in invoices}
    for r in receipts:
        if r["wht"] and r["total"]:
            # WHT is on the amount before VAT: the invoice's own amount when it is known
            # (an invoice with no VAT must not lose 7.5% of its base).
            base = inv_amount.get(r["invoice"]) or r["total"] / (1 + vat_rate)
            by_client[r["client"]][0] += r["wht"]
            by_client[r["client"]][1] += base
    rates = {c: round(w / b, 4) for c, (w, b) in by_client.items() if b}
    if len(rates) >= 2:
        common = Counter(round(x, 3) for x in rates.values()).most_common(1)[0][0]
        for c, x in rates.items():
            if abs(x - common) > 0.002:
                w, b = by_client[c]
                findings.append({"check": "wht_rate_differs", "amount": round(w - b * common, 2),
                                 "what": f"{c} deducted WHT at {x:.1%}; the other clients at "
                                         f"{common:.1%} ({_m(w - b * common)} more)",
                                 "fix": "Check the rate for this kind of work in the tax config; "
                                        "ask the client to correct an over-deduction.",
                                 "source": receipts[0]["where"]})
    # WHT without credit notes
    if receipts and credit_notes is not None:
        has_cn_table = bool(credit_notes)
        for c, (w, _) in by_client.items():
            if has_cn_table and credit_notes.get(c, 0.0) + 0.5 < w:
                gap = w - credit_notes.get(c, 0.0)
                findings.append({"check": "wht_no_credit_note", "amount": round(gap, 2),
                                 "what": f"WHT of {_m(gap)} deducted by {c} has no credit note",
                                 "fix": "Ask the client for the WHT credit note; without it the "
                                        "credit cannot be set off against tax.",
                                 "source": receipts[0]["where"]})
    # retention
    ret = sum(r["retention"] for r in receipts)
    if ret and "retention" not in tb_names:
        findings.append({"check": "retention_not_recorded", "amount": round(ret, 2),
                         "what": f"Clients hold {_m(ret)} of retention; the trial balance has no "
                                 "retention account",
                         "fix": "Record retention receivable (it is still owed to you).",
                         "source": receipts[0]["where"]})
    # billing vs certified work
    for c in contracts:
        billed = sum(i["amount"] for i in invoices if i["contract"] == c["id"]
                     and not ADVANCE.search(i["type"]))
        billed -= sum(i["amount"] for n in dups for i in [x for x in invoices
                      if x["no"] == n and x["contract"] == c["id"]][1:])
        earned = c["value"] * c["certified"]
        if c["value"] and billed - earned > max(1.0, 0.005 * c["value"]):
            findings.append({"check": "over_billing", "amount": round(billed - earned, 2),
                             "what": f"{c['id']} {c['client']}: billed {_m(billed)} but certified "
                                     f"work is {c['certified']:.0%} ({_m(earned)})",
                             "fix": "The excess is a contract liability (billing ahead of work), "
                                    "not revenue.", "source": "contracts register"})
    # Plain sentences (what a person reads, also in the model-free fallback answer).
    summary = (f"{len(findings)} receivables finding(s):\n"
               + "\n".join(f"- {f['what']}. Fix: {f['fix']}" for f in findings)) if findings \
        else "No receivables findings from the standard checks."
    return ToolOutput(data={"findings": findings}, summary=summary)

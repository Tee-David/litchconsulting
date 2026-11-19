"""Bank reconciliation at balance level, across files (plan v5, slice E).

The common year-end case: a bank statement file (CSV, XLSX or a PDF read into a
table) and a trial balance in another file. The tool takes the statement's closing
balance and the TB account's balance, then explains the difference with rules:

- cheques in a cheque register (any open sheet) that are not on the statement:
  unpresented, so they reduce the statement side;
- charges, fees, commissions, stamp duty and SMS alerts on the statement: when they
  add up to the rest of the difference, they are charges not posted in the books.

What is left is shown as "not explained": never forced to zero. The layout is a
proposal on a new sheet in the TB's workbook; values carry their source cells,
because formulas cannot point into another file.
"""
from __future__ import annotations

import re
from typing import Any

from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.model import Sheet, Workbook, a1, qualify, to_number
from litchai.workbench.ops import OpBuilder
from litchai.workbench.tables import Table, detect_table
from litchai.workbench.trial_balance import detect_trial_balance

MONEY = '"₦"#,##0.00'
HEAD = {"b": True, "bg": "E8EEF7"}
TOTAL = {"b": True, "bt": True}
# Bank charges only: "school fees" or "rent" are not bank charges.
CHARGE = re.compile(r"\b(bank charges?|charges?|commission|cot|stamp duty|sms|alert fee|"
                    r"maintenance fee|account fee|transfer fee|card fee|token fee|"
                    r"vat on (charge|fee|commission)|emtl|electronic money transfer levy)\b",
                    re.IGNORECASE)


def _statements(ctx: ToolContext, hint: str | None) -> list[tuple[Workbook, Sheet, Table]]:
    out = []
    for wb in ctx.workbooks.values():
        for sh in wb.sheets.values():
            t = detect_table(sh)
            if t is None or t.col("balance") is None or t.col("date") is None:
                continue
            label = f"{wb.name} {sh.name}".lower()
            if hint and hint.lower() not in label:
                continue
            out.append((wb, sh, t))
    return out


def _lines(sh: Sheet, t: Table) -> list[dict[str, Any]]:
    d, c, amt = t.col("debit"), t.col("credit"), t.col("amount")
    desc, ref, bal = t.col("description"), t.col("reference"), t.col("balance")
    rows = []
    for r in range(t.first_row, t.last_row + 1):
        out = (to_number(sh.value(r, d.index)) or 0.0) if d else 0.0
        inn = (to_number(sh.value(r, c.index)) or 0.0) if c else 0.0
        if amt and not (d or c):
            v = to_number(sh.value(r, amt.index)) or 0.0
            out, inn = (-v, 0.0) if v < 0 else (0.0, v)
        rows.append({"row": r, "out": out, "in": inn,
                     "text": " ".join(str(sh.value(r, x.index) or "") for x in (desc, ref) if x),
                     "balance": to_number(sh.value(r, bal.index)) if bal else None})
    return rows


def _cheques(ctx: ToolContext) -> list[dict[str, Any]]:
    """Rows of any sheet with a cheque number column and an amount."""
    found = []
    for wb in ctx.workbooks.values():
        for sh in wb.sheets.values():
            heads = {str(sh.value(1, c) or "").strip().lower(): c for c in range(1, sh.max_col + 1)}
            no = next((c for h, c in heads.items() if "cheque" in h and ("no" in h or "number" in h)),
                      None)
            amt = next((c for h, c in heads.items() if h.startswith("amount")), None)
            if not (no and amt):
                continue
            payee = next((c for h, c in heads.items() if "payee" in h), None)
            for r in range(2, sh.max_row + 1):
                n, v = sh.value(r, no), to_number(sh.value(r, amt))
                if n not in (None, "") and v:
                    found.append({"no": str(n).removesuffix(".0").strip(), "amount": v,
                                  "payee": sh.value(r, payee) if payee else "",
                                  "cell": qualify(sh.name, a1(r, amt)), "book": wb.name})
    return found


def bank_rec(ctx: ToolContext, *, statement: str | None = None, account: str | None = None,
             statement_balance: float | None = None, write: bool = True) -> ToolOutput:
    stmts = _statements(ctx, statement)
    if not stmts:
        raise ToolError("no bank statement found (a table with date and balance columns)"
                        + (f" matching {statement!r}" if statement else ""))
    if len(stmts) > 1 and not statement:
        raise ToolError("several statements are open: say which one (statement = part of its "
                        f"file name): {[w.name for w, _, _ in stmts]}")
    swb, ssh, st = stmts[0]
    lines = _lines(ssh, st)
    last = next((x for x in reversed(lines) if x["balance"] is not None), None)
    close = statement_balance if statement_balance is not None else (last or {}).get("balance")
    if close is None:
        raise ToolError("the statement has no closing balance; give statement_balance")
    close_cell = qualify(ssh.name, a1(last["row"], st.col("balance").index)) if last else None

    tb = detect_trial_balance(ctx, skip_adjusted=True)
    if tb is None:
        raise ToolError("no trial balance found for the ledger balance")
    want = (account or "").lower()
    bank_word = next((w for w in re.findall(r"[a-z]+", swb.name.lower())
                      if len(w) > 3 and w not in ("statement", "bank", "fy2025", "account")), "")
    acc = next((a for a in tb.accounts if want and (a.code == account or want in a.name.lower())),
               None) or next((a for a in tb.accounts if bank_word and bank_word in a.name.lower()),
                             None)
    if acc is None:
        raise ToolError("say which TB account is this bank (account = its code or name)")
    ledger = round(acc.debit - acc.credit, 2)
    ledger_cell = qualify(tb.sheet.name, a1(acc.row, tb.debit_col or tb.balance_col))

    text = " ".join(x["text"] for x in lines)
    unpresented = [c for c in _cheques(ctx) if c["no"] not in text
                   and not any(abs(x["out"] - c["amount"]) < 0.005 and c["no"][-3:] in x["text"]
                               for x in lines)]
    charges = [x for x in lines if x["out"] and CHARGE.search(x["text"])]
    charge_total = round(sum(x["out"] for x in charges), 2)
    cheque_total = round(sum(c["amount"] for c in unpresented), 2)
    # A cheque register is not tied to one bank, and not every charge is unposted:
    # keep the explanation (cheques, charges, both or neither) that leaves least.
    options = [(use_q, use_c) for use_q in (False, True) for use_c in (False, True)
               if (cheque_total or not use_q) and (charge_total or not use_c)]

    def leftover(o: tuple[bool, bool]) -> float:
        return abs((close - (cheque_total if o[0] else 0)) - (ledger - (charge_total if o[1] else 0)))

    use_q, charges_unposted = min(options, key=lambda o: (round(leftover(o), 2), o[0] + o[1]))
    if not use_q:
        unpresented = []
    adj_stmt = round(close - sum(c["amount"] for c in unpresented), 2)
    adj_ledger = round(ledger - (charge_total if charges_unposted else 0.0), 2)
    left = round(adj_stmt - adj_ledger, 2)
    data: dict[str, Any] = {
        "statement": f"{swb.name} {ssh.name}", "statement_balance": close,
        "statement_cell": close_cell, "account": f"{acc.code} {acc.name}".strip(),
        "ledger_balance": ledger, "ledger_cell": ledger_cell,
        "unpresented_cheques": [{k: c[k] for k in ("no", "amount", "payee", "cell")}
                                for c in unpresented],
        "charges_on_statement": charge_total, "charge_lines": len(charges),
        "charges_not_posted": charges_unposted, "adjusted_statement": adj_stmt,
        "adjusted_ledger": adj_ledger, "not_explained": left, "reconciled": abs(left) <= 0.5}
    summary = (f"{acc.name}: statement {close:,.2f}, ledger {ledger:,.2f}. "
               + (f"Unpresented cheques {sum(c['amount'] for c in unpresented):,.2f}. "
                  if unpresented else "")
               + (f"Charges on the statement not in the books {charge_total:,.2f}. "
                  if charges_unposted else "")
               + ("Reconciled." if data["reconciled"] else f"Not explained: {left:,.2f}."))
    cites = [c for c in (close_cell, ledger_cell) if c]
    if not write:
        return ToolOutput(data=data, summary=summary, citations=cites)

    b = OpBuilder(tb.workbook, "bank_rec")
    bank_label = acc.name[:20]
    name = b.create_sheet(f"Bank rec - {bank_label}"[:31], f"Bank reconciliation {acc.name}")
    reason = f"bank_rec · {swb.name} vs {tb.sheet.name}"
    rows: list[tuple[str, Any, str, dict | None]] = [
        (f"Balance per statement ({swb.name})", close, close_cell or "", None)]
    for c in unpresented:
        rows.append((f"Less: unpresented cheque {c['no']} {c['payee'] or ''}".strip(),
                     -c["amount"], f"{c['book']} {c['cell']}", None))
    rows.append(("Adjusted statement balance", None, "", TOTAL))
    rows.append((f"Balance per ledger ({acc.name})", ledger, ledger_cell, None))
    if charges_unposted:
        rows.append((f"Less: bank charges on the statement, not posted ({len(charges)} lines)",
                     -charge_total, f"{swb.name}", None))
    rows.append(("Adjusted ledger balance", None, "", TOTAL))
    rows.append(("Not explained (should be 0)", None, "", TOTAL))
    for i, h in enumerate(("Item", "Amount", "Source"), start=1):
        b.set(name, a1(1, i), value=h, reason=reason, style=HEAD)
    r = 2
    stmt_rows: list[int] = []
    led_rows: list[int] = []
    side = stmt_rows
    marks: dict[str, int] = {}
    for label, v, src, st_ in rows:
        b.set(name, f"A{r}", value=label, reason=reason, style=st_)
        if label.startswith("Adjusted statement"):
            b.set(name, f"B{r}", formula="=" + "+".join(f"B{x}" for x in stmt_rows),
                  number_format=MONEY, reason=reason, style=TOTAL)
            marks["stmt"] = r
            side = led_rows
        elif label.startswith("Adjusted ledger"):
            b.set(name, f"B{r}", formula="=" + "+".join(f"B{x}" for x in led_rows),
                  number_format=MONEY, reason=reason, style=TOTAL)
            marks["led"] = r
        elif label.startswith("Not explained"):
            b.set(name, f"B{r}", formula=f"=B{marks['stmt']}-B{marks['led']}",
                  number_format=MONEY, reason=reason, style=TOTAL)
            b.set(name, f"C{r}", formula=f'=IF(ABS(B{r})<=0.5,"PASS","FAIL")', reason=reason)
            from litchai.workbench.condfmt import FAIL_RULE, PASS_RULE

            b.cond_format(name, f"C{r}", [PASS_RULE, FAIL_RULE], reason=reason)
        else:
            b.set(name, f"B{r}", value=v, number_format=MONEY, reason=reason)
            side.append(r)
        if src:
            b.set(name, f"C{r}", value=src, reason=reason)
        r += 1
    batch = finish_batch(ctx, b, f"Bank reconciliation: {acc.name}", summary[:300])
    return ToolOutput(data=data, batch=batch, summary=summary, citations=cites)

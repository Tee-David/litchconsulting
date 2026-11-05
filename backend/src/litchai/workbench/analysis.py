"""Deterministic analysis tools: reconcile, flag_anomalies, tax_compute.

All numbers are computed here in Python (and, when written, as formulas the
recompute gate re-checks). Tax rates come only from the shared
``nigeria-tax-config.json`` — never a literal in this file.
"""
from __future__ import annotations

import statistics
from collections import deque
from datetime import date, datetime
from typing import Any

from litchai.taxconfig import load_tax_config
from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.model import Sheet, a1, looks_like_text_date, qualify, to_number
from litchai.workbench.ops import OpBuilder
from litchai.workbench.profile import benford, duplicate_rows
from litchai.workbench.tables import Table

# --- reconcile -----------------------------------------------------------------------


def _as_date(v: Any) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        from litchai.workbench.model import _coerce

        c = _coerce(v)
        return c if isinstance(c, date) else None
    return None


def _entries(sh: Sheet, table: Table) -> list[dict[str, Any]]:
    dcol, desc = table.col("date"), table.col("description")
    out = []
    for r in range(table.first_row, table.last_row + 1):
        amt = table.amount(sh, r)
        if amt is None or amt == 0:
            continue
        out.append({
            "row": r, "amount": round(amt, 2),
            "date": _as_date(sh.value(r, dcol.index)) if dcol else None,
            "desc": str(sh.value(r, desc.index) or "") if desc else "",
        })
    return out


def _closing(sh: Sheet, table: Table, entries: list[dict[str, Any]]) -> tuple[float, str | None]:
    bal = table.col("balance")
    if bal is not None:
        for r in range(table.last_row, table.first_row - 1, -1):
            v = to_number(sh.value(r, bal.index))
            if v is not None:
                return round(v, 2), qualify(sh.name, a1(r, bal.index))
    return round(sum(e["amount"] for e in entries), 2), None


def reconcile(ctx: ToolContext, *, bank_sheet: str | None = None,
              ledger_sheet: str | None = None, date_window_days: int = 3,
              write: bool = True, new_sheet_name: str = "Recon",
              balance_per_bank: float | None = None,
              balance_per_books: float | None = None) -> ToolOutput:
    """Match bank lines to ledger lines by amount within a date window, then
    lay out a bank reconciliation (compile_bank_rec) whose items link to the
    unmatched source cells."""
    def dated_amounts(t: Table) -> bool:
        return t.col("date") is not None and any(
            t.col(r) is not None for r in ("amount", "debit", "credit"))

    wb_b, sh_b, t_b = ctx.find_sheet(
        bank_sheet, prefer=lambda t: dated_amounts(t) and t.col("balance") is not None)
    wb_l, sh_l, t_l = ctx.find_sheet(
        ledger_sheet,
        prefer=lambda t: dated_amounts(t) and t.sheet != sh_b.name
        and t.col("balance") is None)
    if (wb_b.id, sh_b.name) == (wb_l.id, sh_l.name):
        raise ToolError("need two different sheets: a bank statement and a ledger/cash book")
    bank, ledger = _entries(sh_b, t_b), _entries(sh_l, t_l)
    if not bank or not ledger:
        raise ToolError("one of the sheets has no amounts to match")

    def match(flip: bool) -> list[tuple[int, int]]:
        pool: dict[float, deque[int]] = {}
        for j, e in enumerate(ledger):
            pool.setdefault(round(-e["amount"] if flip else e["amount"], 2), deque()).append(j)
        pairs, used = [], set()
        for i, e in enumerate(bank):
            cands = pool.get(e["amount"])
            if not cands:
                continue
            best = None
            for j in cands:
                if j in used:
                    continue
                d1, d2 = e["date"], ledger[j]["date"]
                if d1 and d2 and abs((d1 - d2).days) > date_window_days:
                    continue
                best = j
                break
            if best is not None:
                used.add(best)
                pairs.append((i, best))
        return pairs

    same, flipped = match(False), match(True)
    flip = len(flipped) > len(same)
    pairs = flipped if flip else same
    mb = {i for i, _ in pairs}
    ml = {j for _, j in pairs}
    bank_only = [bank[i] for i in range(len(bank)) if i not in mb]
    ledger_only = [ledger[j] for j in range(len(ledger)) if j not in ml]

    def lsign(e: dict[str, Any]) -> float:  # ledger amount in bank sign
        return -e["amount"] if flip else e["amount"]

    bank_close, bank_ref = _closing(sh_b, t_b, bank)
    if balance_per_bank is not None:
        bank_close, bank_ref = float(balance_per_bank), None
    # Books opening defaults to the bank's opening balance (balance column of the
    # first bank row less its movement); pass balance_per_books to override.
    from litchai.workbench.builders import _opening_cash

    books_opening = _opening_cash(sh_b, t_b) or 0.0
    books_close = round(books_opening + sum(lsign(e) for e in ledger), 2)
    if balance_per_books is not None:
        books_close = float(balance_per_books)
    dit = [e for e in ledger_only if lsign(e) > 0]       # in books, not yet in bank
    oc = [e for e in ledger_only if lsign(e) < 0]        # cheques not yet presented
    add_books = [e for e in bank_only if e["amount"] > 0]
    less_books = [e for e in bank_only if e["amount"] < 0]
    adj_bank = bank_close + sum(lsign(e) for e in dit) + sum(lsign(e) for e in oc)
    adj_books = books_close + sum(e["amount"] for e in add_books) + sum(
        e["amount"] for e in less_books)
    difference = round(adj_bank - adj_books, 2)

    def item(e: dict[str, Any], sh: Sheet, table: Table, side: str) -> dict[str, Any]:
        return {"row": e["row"], "sheet": sh.name, "date": e["date"].isoformat() if e["date"]
                else None, "description": e["desc"][:120], "amount": e["amount"], "side": side,
                "cell": qualify(sh.name, a1(e["row"], (table.col("description")
                                                        or table.columns[0]).index))}

    data: dict[str, Any] = {
        "bank_sheet": sh_b.name, "ledger_sheet": sh_l.name, "matched": len(pairs),
        "ledger_sign_flipped": flip, "balance_per_bank": bank_close,
        "balance_per_books": books_close, "books_opening_balance": books_opening,
        "difference": difference,
        "bank_only": [item(e, sh_b, t_b, "bank") for e in bank_only][:100],
        "ledger_only": [item(e, sh_l, t_l, "ledger") for e in ledger_only][:100],
        "deposits_in_transit": round(sum(lsign(e) for e in dit), 2),
        "outstanding_cheques": round(-sum(lsign(e) for e in oc), 2),
    }
    if not write:
        return ToolOutput(data=data, summary=(
            f"{len(pairs)} matched; {len(bank_only)} bank-only and {len(ledger_only)} "
            f"ledger-only lines; difference {difference:,.2f}."))

    from litchai.compilers.bank_rec import compile_bank_rec
    from litchai.contracts.bank_rec import BankRecContract, RecItem

    def amount_ref(sh: Sheet, table: Table, r: int) -> str:
        cr, dr, amt = table.col("credit"), table.col("debit"), table.col("amount")
        if cr or dr:
            c = qualify(sh.name, a1(r, cr.index)) if cr else "0"
            d = qualify(sh.name, a1(r, dr.index)) if dr else "0"
            return f"=ABS({c}-{d})"
        return f"=ABS({qualify(sh.name, a1(r, amt.index))})"

    links: dict[str, deque] = {}

    def rec_items(entries: list[dict[str, Any]], sh: Sheet, table: Table) -> list[RecItem]:
        out = []
        for e in entries:
            label = f"{e['date'].isoformat() if e['date'] else ''} {e['desc'][:60]}".strip()
            label = label or f"Row {e['row']}"
            out.append(RecItem(label=label, amount=abs(e["amount"])))
            links.setdefault(label, deque()).append(
                (amount_ref(sh, table, e["row"]), abs(e["amount"]),
                 [qualify(sh.name, a1(e["row"], table.columns[0].index))]))
        return out

    contract = BankRecContract(
        client_name=ctx.client_name, period_label=ctx.period_label or "Period",
        balance_per_bank=bank_close, deposits_in_transit=rec_items(dit, sh_l, t_l),
        outstanding_cheques=rec_items(oc, sh_l, t_l), balance_per_books=books_close,
        add_to_books=rec_items(add_books, sh_b, t_b), less_from_books=rec_items(less_books,
                                                                                sh_b, t_b),
    )
    compiled = compile_bank_rec(contract)
    if bank_ref:
        links.setdefault("Balance per bank statement", deque()).append(
            (f"={bank_ref}", bank_close, [bank_ref]))
    from litchai.workbench.builders import _copy_compiled

    target_wb = ctx.workbook(wb_b.id)
    b = OpBuilder(target_wb, "reconcile")
    target = b.create_sheet(new_sheet_name, f"Bank reconciliation of {sh_b.name} to {sh_l.name}")
    _copy_compiled(b, compiled.workbook.active, target, links, "C", "B",
                   f"reconcile {sh_b.name} ↔ {sh_l.name}")
    batch = finish_batch(ctx, b, "Reconcile bank to ledger",
                         f"{target} · {len(pairs)} matched, {len(bank_only) + len(ledger_only)}"
                         " reconciling items")
    key = {k: qualify(target, v) for k, v in compiled.key_cells.items()}
    data["key_cells"] = key
    return ToolOutput(data=data, batch=batch, citations=list(key.values()), summary=(
        f"{len(pairs)} matched; difference after adjustments {difference:,.2f}."))


# --- flag_anomalies ----------------------------------------------------------------------
def flag_anomalies(ctx: ToolContext, *, sheet: str | None = None,
                   workbook_id: str | None = None, round_threshold: float = 1_000_000,
                   z: float = 3.5) -> ToolOutput:
    """Read-only findings with cell refs: duplicates, outliers (robust z on
    MAD), large round amounts, weekend postings, text numbers / text dates,
    running-balance breaks and Benford nonconformity. Every sheet when no
    sheet is named."""
    books = [ctx.workbook(workbook_id)] if workbook_id else list(ctx.workbooks.values())
    findings: list[dict[str, Any]] = []
    from litchai.workbench.tables import detect_table

    for wb in books:
        for name, sh in wb.sheets.items():
            if sheet and name.lower() != sheet.lower():
                continue
            t = detect_table(sh)
            if t is None or not t.columns or t.n_rows == 0:
                continue
            if not sheet and sh.formula_count() * 2 > len(sh.cells):
                continue  # a computed schedule (often a pending proposal), not source data
            findings.extend(_sheet_findings(sh, t, round_threshold, z))
    by_kind: dict[str, int] = {}
    for f in findings:
        by_kind[f["kind"]] = by_kind.get(f["kind"], 0) + 1
    return ToolOutput(
        data={"count": len(findings), "by_kind": by_kind, "findings": findings[:200]},
        citations=[f["cell"] for f in findings[:20]],
        summary=f"{len(findings)} findings: " + ", ".join(f"{v} {k}" for k, v in by_kind.items()),
    )


def _sheet_findings(sh: Sheet, t: Table, round_threshold: float, z: float) -> list[dict]:
    out: list[dict[str, Any]] = []
    desc = t.col("description") or t.columns[0]

    def add(kind: str, row: int, col: int, msg: str, severity: str = "warn") -> None:
        out.append({"kind": kind, "severity": severity, "cell": qualify(sh.name, a1(row, col)),
                    "row": row, "message": msg})

    for group in duplicate_rows(sh, t):
        for r in group[1:]:
            add("duplicate", r, desc.index, f"Same as row {group[0]}")
    amounts = [(r, t.amount(sh, r)) for r in range(t.first_row, t.last_row + 1)]
    amounts = [(r, a) for r, a in amounts if a is not None and a != 0]
    vals = [abs(a) for _, a in amounts]
    amt_col = (t.col("amount") or t.col("debit") or t.col("credit") or desc).index
    cr_col = t.col("credit")

    def col_of(r: int, a: float) -> int:
        """The column that actually holds this row's amount (credit for inflows)."""
        if cr_col is not None and a > 0 and sh.value(r, cr_col.index) is not None:
            return cr_col.index
        return amt_col
    if len(vals) >= 8:
        med = statistics.median(vals)
        mad = statistics.median(abs(v - med) for v in vals) or 0.0
        if mad > 0:
            for r, a in amounts:
                score = 0.6745 * (abs(a) - med) / mad
                if score > z:
                    add("outlier", r, col_of(r, a), f"{abs(a):,.2f} is far above the typical "
                        f"{med:,.2f} (robust z {score:.1f})")
    for r, a in amounts:
        if abs(a) >= round_threshold and abs(a) % 100_000 == 0:
            add("round_amount", r, col_of(r, a), f"Large round amount {abs(a):,.0f}", "info")
    dcol = t.col("date")
    if dcol:
        for r in range(t.first_row, t.last_row + 1):
            v = sh.value(r, dcol.index)
            d = _as_date(v)
            if isinstance(v, str) and looks_like_text_date(v):
                add("text_date", r, dcol.index, f"Date typed as text ({v!r})")
            if d and d.weekday() >= 5:
                add("weekend", r, dcol.index, f"Posted on a {d.strftime('%A')}", "info")
    for col in t.columns:
        if col.role in ("amount", "debit", "credit", "balance"):
            for r in range(t.first_row, t.last_row + 1):
                v = sh.value(r, col.index)
                if isinstance(v, str) and to_number(v) is not None:
                    add("text_number", r, col.index, f"Number stored as text ({v!r})")
    bal = t.col("balance")
    if bal:
        prev = None
        for r in range(t.first_row, t.last_row + 1):
            b = to_number(sh.value(r, bal.index))
            a = t.amount(sh, r)
            if b is None:
                continue
            if prev is not None and a is not None and abs(prev + a - b) > 0.01:
                add("balance_break", r, bal.index,
                    f"Balance {b:,.2f} ≠ previous {prev:,.2f} + {a:,.2f}", "bad")
            prev = b
    bf = benford(vals)
    if bf and bf["verdict"] == "nonconformity":
        add("benford", t.first_row, amt_col,
            f"First digits don't follow Benford's law (MAD {bf['mad']})", "info")
    return out


# --- tax_compute ----------------------------------------------------------------------------
def paye_annual(cfg: dict, chargeable: float) -> tuple[float, list[dict[str, Any]]]:
    remaining = max(0.0, chargeable)
    tax, bands = 0.0, []
    for band in cfg["paye"]["bands"]:
        if remaining <= 0:
            break
        width = band["width"]
        taxable = remaining if width is None else min(remaining, width)
        t = taxable * band["ratePct"] / 100
        bands.append({"label": band["label"], "rate_pct": band["ratePct"],
                      "taxable": round(taxable, 2), "tax": round(t, 2)})
        tax += t
        remaining -= taxable
    return round(tax, 2), bands


def tax_compute(ctx: ToolContext, *, kind: str, inputs: dict[str, Any] | None = None,
                write: bool = False, new_sheet_name: str | None = None) -> ToolOutput:
    """CIT / VAT / WHT / PAYE from the shared config. ``write`` lays the
    computation out with the matching template compiler as a new sheet."""
    cfg = load_tax_config()
    p = inputs or {}

    def num(key: str, default: float = 0.0) -> float:
        v = p.get(key, default)
        n = to_number(v) if not isinstance(v, (int, float)) else float(v)
        if n is None:
            raise ToolError(f"{key} must be a number")
        return n

    data: dict[str, Any] = {"kind": kind, "tax_config_version": cfg["version"]}
    compiled = None
    if kind == "cit":
        c = cfg["cit"]
        npa = num("net_profit_per_accounts", num("profit_before_tax"))
        add = sum(to_number(x.get("amount")) or 0 for x in p.get("disallowable_addbacks", []))
        add += num("addbacks")
        ded = sum(to_number(x.get("amount")) or 0 for x in p.get("other_deductions", []))
        ded += num("deductions")
        ca = sum((to_number(a.get("cost")) or 0) * (to_number(a.get("allowance_rate_pct")) or 0)
                 / 100 for a in p.get("capital_allowance_assets", []))
        ca += num("capital_allowances")
        turnover, assets = num("turnover"), num("total_fixed_assets")
        prof = bool(p.get("professional_services", False))
        sc = c["smallCompany"]
        small = (turnover <= sc["maxTurnover"] and assets <= sc["maxFixedAssets"]
                 and not (prof and sc["professionalServicesExcluded"]))
        assessable = max(0.0, npa + add - ded)
        total_profit = max(0.0, assessable - ca)
        rate = sc["ratePct"] if small else c["standardRatePct"]
        cit = round(total_profit * rate / 100, 2)
        levy = 0.0 if (small and sc["developmentLevyExempt"]) else round(
            assessable * c["developmentLevy"]["ratePct"] / 100, 2)
        data.update({"small_company": small, "assessable_profit": round(assessable, 2),
                     "capital_allowances": round(ca, 2), "total_profit": round(total_profit, 2),
                     "rate_pct": rate, "cit": cit, "development_levy": levy,
                     "total_tax": round(cit + levy, 2)})
        if write:
            from litchai.compilers.cit import compile_cit
            from litchai.contracts.cit import CitContract

            compiled = compile_cit(CitContract(
                client_name=ctx.client_name, period_label=ctx.period_label or "Period",
                net_profit_per_accounts=npa,
                disallowable_addbacks=p.get("disallowable_addbacks", [])
                or ([{"label": "Add-backs", "amount": add}] if add else []),
                other_deductions=p.get("other_deductions", [])
                or ([{"label": "Deductions", "amount": ded}] if ded else []),
                turnover=turnover, total_fixed_assets=assets, professional_services=prof,
                capital_allowance_assets=p.get("capital_allowance_assets", []),
            ))
    elif kind == "vat":
        rate = cfg["vat"]["standardRatePct"]
        sales, purchases = num("standard_rated_sales"), num("standard_rated_purchases")
        credit = num("vat_credit_brought_forward")
        if p.get("amounts_include_vat"):
            sales, purchases = sales / (1 + rate / 100), purchases / (1 + rate / 100)
        output, inp = round(sales * rate / 100, 2), round(purchases * rate / 100, 2)
        data.update({"rate_pct": rate, "net_sales": round(sales, 2),
                     "net_purchases": round(purchases, 2), "output_vat": output,
                     "input_vat": inp, "credit_brought_forward": credit,
                     "net_payable": round(output - inp - credit, 2)})
        if write:
            from litchai.compilers.vat import compile_vat_return
            from litchai.contracts.vat import VatReturnContract

            compiled = compile_vat_return(VatReturnContract(
                client_name=ctx.client_name, period_label=ctx.period_label or "Period",
                standard_rated_sales=[{"label": "Standard-rated sales", "net_amount": sales}],
                standard_rated_purchases=[{"label": "Standard-rated purchases",
                                           "net_amount": purchases}],
                vat_credit_brought_forward=credit,
            ))
    elif kind == "wht":
        lines = p.get("deductions") or [{"vendor": p.get("vendor", "Payee"),
                                         "category": p.get("category", "consultancy"),
                                         "payee_type": p.get("payee_type", "corporate"),
                                         "gross_amount": num("gross_amount")}]
        out_lines, total = [], 0.0
        exempt_limit = cfg["wht"]["smallSupplierExemption"]["maxMonthlyPayment"]
        for ln in lines:
            rates = cfg["wht"]["rates"].get(ln.get("category", ""))
            if rates is None:
                raise ToolError(f"unknown WHT category {ln.get('category')!r} "
                                f"(have: {sorted(cfg['wht']['rates'])})")
            pct = rates["corporatePct" if ln.get("payee_type", "corporate") == "corporate"
                        else "individualPct"]
            gross = to_number(ln.get("gross_amount")) or 0.0
            exempt = bool(ln.get("exempt", False))
            wht = 0.0 if exempt else round(gross * pct / 100, 2)
            total += wht
            out_lines.append({**ln, "rate_pct": pct, "wht": wht,
                              "small_supplier_candidate": gross <= exempt_limit})
        data.update({"lines": out_lines, "total_wht": round(total, 2)})
        if write:
            from litchai.compilers.wht import compile_wht_schedule
            from litchai.contracts.wht import WhtScheduleContract

            compiled = compile_wht_schedule(WhtScheduleContract(
                client_name=ctx.client_name, period_label=ctx.period_label or "Period",
                deductions=[{k: v for k, v in ln.items() if k in ("vendor", "category",
                                                                   "payee_type", "gross_amount",
                                                                   "exempt")} for ln in lines]))
    elif kind == "paye":
        pr = cfg["payroll"]
        employees = p.get("employees") or [{"name": p.get("name", "Employee"),
                                            "gross_annual": num("gross_annual"),
                                            "pension": p.get("pension", True),
                                            "nhf": p.get("nhf", False)}]
        rows, total = [], 0.0
        for e in employees:
            gross = to_number(e.get("gross_annual")) or 0.0
            pension = gross * pr["pension"]["employeePct"] / 100 if e.get("pension", True) else 0
            nhf = gross * pr["nhf"]["employeePct"] / 100 if e.get("nhf", False) else 0
            rent = to_number(e.get("rent_paid")) or 0.0
            rr = cfg["paye"]["rentRelief"]
            rent_relief = min(rent * rr["ratePct"] / 100, rr["cap"])
            chargeable = max(0.0, gross - pension - nhf - rent_relief)
            tax, bands = paye_annual(cfg, chargeable)
            total += tax
            rows.append({"name": e.get("name"), "gross_annual": gross,
                         "pension": round(pension, 2), "nhf": round(nhf, 2),
                         "rent_relief": round(rent_relief, 2),
                         "chargeable": round(chargeable, 2), "annual_tax": tax,
                         "monthly_tax": round(tax / 12, 2), "bands": bands})
        data.update({"employees": rows, "total_annual_paye": round(total, 2)})
        if write:
            from litchai.compilers.payroll import compile_payroll
            from litchai.contracts.payroll import PayrollContract

            compiled = compile_payroll(PayrollContract(
                client_name=ctx.client_name, period_label=ctx.period_label or "Period",
                employees=[{"name": e.get("name") or "Employee",
                            "gross_annual": to_number(e.get("gross_annual")) or 0.0,
                            "pension": e.get("pension", True), "nhf": e.get("nhf", False)}
                           for e in employees]))
    else:
        raise ToolError("kind must be cit, vat, wht or paye")

    if compiled is None:
        return ToolOutput(data=data, summary=_tax_summary(data))
    from litchai.workbench.builders import _copy_compiled

    b = OpBuilder(ctx.workbook(), "tax_compute")
    target = b.create_sheet(new_sheet_name or f"{kind.upper()} computation",
                            f"{kind.upper()} computation (tax config {cfg['version']})")
    _copy_compiled(b, compiled.workbook.active, target, {}, "C", "B",
                   f"tax_compute {{{kind}}} · config {cfg['version']}")
    batch = finish_batch(ctx, b, f"{kind.upper()} computation as a new sheet", target)
    key = {k: qualify(target, v) for k, v in compiled.key_cells.items()}
    data["key_cells"] = key
    return ToolOutput(data=data, batch=batch, citations=list(key.values())[:10],
                      summary=_tax_summary(data))


def _tax_summary(d: dict[str, Any]) -> str:
    k = d["kind"]
    if k == "cit":
        return (f"CIT {d['cit']:,.2f} at {d['rate_pct']}% plus development levy "
                f"{d['development_levy']:,.2f} ({'small' if d['small_company'] else 'not small'})")
    if k == "vat":
        return f"Net VAT payable {d['net_payable']:,.2f}"
    if k == "wht":
        return f"Total WHT {d['total_wht']:,.2f}"
    return f"Total annual PAYE {d['total_annual_paye']:,.2f}"

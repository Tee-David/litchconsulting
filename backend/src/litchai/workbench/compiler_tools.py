"""The seven template compilers as workbench tools (research plan §2).

Each tool takes typed inputs, either as explicit lines or read from a sheet by
column name. Python computes every figure (the tool computes, the model only
plans). The compiler's formula sheet is laid out as a PROPOSAL: nothing changes
until the user accepts, and the recompute gate then checks every formula.

Every output carries a ``basis`` block: the rule, the rates, the tax-config
version and the compiler version, the inputs used and any assumption. Rates come
from the shared tax config only; an unknown category or a missing column is
refused with a message that names it, never guessed.
"""
from __future__ import annotations

import io
from datetime import date, datetime
from typing import Any

from litchai.taxconfig import load_tax_config
from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.model import a1, parse_a1, qualify, to_number
from litchai.workbench.ops import OpBuilder

TOP_ROWS = 20  # token-light: the first rows only; the full schedule is the proposal


# --- shared helpers -----------------------------------------------------------------
def basis(rule: str, *, compiler: str, rates: dict[str, Any] | None = None,
          inputs: dict[str, Any] | None = None, assumptions: list[str] | None = None,
          source: str | None = None) -> dict[str, Any]:
    cfg = load_tax_config()
    return {"rule": rule, "rates": rates or {}, "config_version": cfg["version"],
            "source": source or f"tax config {cfg['version']}", "compiler": compiler,
            "inputs": inputs or {}, "assumptions": assumptions or []}


def _as_date(v: Any, what: str) -> date:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y", "%d-%b-%Y"):
            try:
                return datetime.strptime(v.strip(), fmt).date()
            except ValueError:
                continue
    raise ToolError(f"{what}: {v!r} is not a date (use YYYY-MM-DD)")


def _money(v: Any, what: str) -> float:
    n = float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else to_number(v)
    if n is None:
        raise ToolError(f"{what}: {v!r} is not an amount")
    return float(n)


def _flag(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    return str(v or "").strip().lower() in ("y", "yes", "true", "1", "done", "x", "completed")


def sheet_rows(ctx: ToolContext, sheet: str | None, workbook_id: str | None,
               fields: dict[str, tuple[str | None, tuple[str, ...], bool]]
               ) -> tuple[list[dict[str, Any]], str, str]:
    """Rows of a sheet table as dicts. ``fields``: name → (explicit header, header
    words to look for, required). Returns (rows, sheet name, the range cited)."""
    _wb, sh, table = ctx.find_sheet(sheet, workbook_id)
    cols: dict[str, int] = {}
    missing: list[str] = []
    for name, (header, words, required) in fields.items():
        col = table.col(header) if header else None
        if header and col is None:
            raise ToolError(f"{sh.name} has no column {header!r} "
                            f"(columns: {[c.name for c in table.columns]})")
        if col is None:
            col = next((c for c in table.columns
                        if any(w in c.name.strip().lower() for w in words)), None)
        if col is not None:
            cols[name] = col.index
        elif required:
            missing.append(name)
    if missing:
        raise ToolError(f"{sh.name}: name the column for {missing} "
                        f"(columns: {[c.name for c in table.columns]})")
    rows = []
    for r in range(table.first_row, table.last_row + 1):
        row = {k: sh.value(r, c) for k, c in cols.items()}
        if all(v in (None, "") for v in row.values()):
            continue
        row["_row"] = r
        rows.append(row)
    last = max(cols.values()) if cols else 1
    cited = qualify(sh.name, f"{a1(table.first_row, min(cols.values()) if cols else 1)}:"
                             f"{a1(table.last_row, last)}")
    return rows, sh.name, cited


def propose(ctx: ToolContext, compiled: Any, tool: str, title: str, new_sheet_name: str | None,
            reason: str, *, all_sheets: bool = False) -> tuple[Any, dict[str, str], list[str]]:
    """The compiler's sheet(s) as one pending batch. Returns (batch, key cells
    qualified by the new sheet names, the new sheet names)."""
    from litchai.compilers._common import sheet_ref, split_sheet_ref
    from litchai.workbench.builders import _copy_compiled

    b = OpBuilder(ctx.workbook(), tool)
    sources = compiled.workbook.worksheets if all_sheets else [compiled.workbook.active]
    names: dict[str, str] = {}
    for ws in sources:
        want = ws.title if all_sheets else (new_sheet_name or ws.title)
        names[ws.title] = b.create_sheet(want, f"{title}: {ws.title}")
    renamed = {old: new for old, new in names.items() if old != new}
    for ws in sources:
        start = len(b.ops)
        _copy_compiled(b, ws, names[ws.title], {}, "", "", reason)
        if renamed:  # keep cross-sheet formulas pointing at the renamed tabs
            for op in b.ops[start:]:
                if op.new_formula:
                    for old, new in renamed.items():
                        op.new_formula = op.new_formula.replace(sheet_ref(old, ""),
                                                                sheet_ref(new, ""))
    first = names[sources[0].title]
    batch = finish_batch(ctx, b, title, ", ".join(names.values()))
    key: dict[str, str] = {}
    for k, ref in compiled.key_cells.items():
        sheet, cell = split_sheet_ref(ref)
        key[k] = qualify(names.get(sheet, first) if sheet else first, cell)
    return batch, key, list(names.values())


def _out(ctx: ToolContext, compiled: Any, tool: str, title: str, new_sheet_name: str | None,
         data: dict[str, Any], summary: str, cited: list[str], *,
         all_sheets: bool = False) -> ToolOutput:
    batch, key, sheets = propose(ctx, compiled, tool, title, new_sheet_name,
                                 f"{tool} · {data['basis']['compiler']} · config "
                                 f"{data['basis']['config_version']}", all_sheets=all_sheets)
    data["key_cells"] = key
    data["sheets"] = sheets
    return ToolOutput(data=data, batch=batch, summary=summary,
                      citations=(cited + list(key.values()))[:20])


def _period(ctx: ToolContext, label: str | None) -> str:
    return label or ctx.period_label or "Period"


# --- 1. AR / AP aging ---------------------------------------------------------------
BUCKETS = (("not_due", "Not due"), ("b1_30", "1–30"), ("b31_60", "31–60"),
           ("b61_90", "61–90"), ("b90_plus", "90+"))


def _bucket(days: int) -> str:
    if days <= 0:
        return "not_due"
    if days <= 30:
        return "b1_30"
    if days <= 60:
        return "b31_60"
    if days <= 90:
        return "b61_90"
    return "b90_plus"


def ar_ap_aging(ctx: ToolContext, *, as_at: str, kind: str = "receivables",
                items: list[dict[str, Any]] | None = None, sheet: str | None = None,
                workbook_id: str | None = None, party_column: str | None = None,
                reference_column: str | None = None, amount_column: str | None = None,
                due_column: str | None = None, period_label: str | None = None,
                new_sheet_name: str | None = None) -> ToolOutput:
    from litchai.compilers.ar_ap_aging import COMPILER_VERSION, compile_ar_ap_aging
    from litchai.contracts.ar_ap_aging import AgingContract

    when = _as_date(as_at, "as_at")
    cited: list[str] = []
    if items is None:
        rows, _sheet, rng = sheet_rows(ctx, sheet, workbook_id, {
            "party": (party_column, ("customer", "debtor", "creditor", "supplier", "vendor",
                                     "party", "name"), True),
            "reference": (reference_column, ("invoice", "ref", "number", "no"), False),
            "amount": (amount_column, ("outstanding", "balance", "amount", "due amount"), True),
            "due_date": (due_column, ("due",), True),
        })
        items, cited = rows, [rng]
    lines = []
    for i, it in enumerate(items, start=1):
        due = _as_date(it.get("due_date"), f"line {i} due_date")
        amt = _money(it.get("amount"), f"line {i} amount")
        days = (when - due).days
        lines.append({"party": str(it.get("party") or f"Line {i}"),
                      "reference": str(it.get("reference") or ""), "amount": amt,
                      "due_date": due, "days": days, "bucket": _bucket(days)})
    totals = {k: round(sum(x["amount"] for x in lines if x["bucket"] == k), 2) for k, _ in BUCKETS}
    grand = round(sum(x["amount"] for x in lines), 2)
    by_party: dict[str, float] = {}
    for x in lines:
        by_party[x["party"]] = by_party.get(x["party"], 0.0) + x["amount"]
    top = sorted(by_party.items(), key=lambda kv: kv[1], reverse=True)[:5]
    overdue = round(grand - totals["not_due"], 2)
    data = {
        "kind": kind, "as_at": when.isoformat(), "grand_total": grand, "buckets": totals,
        "overdue_total": overdue, "items": len(lines),
        "top_parties": [{"party": p, "amount": round(a, 2)} for p, a in top],
        "lines": [{**x, "due_date": x["due_date"].isoformat()} for x in lines[:TOP_ROWS]],
        "basis": basis("Age = as-at date minus due date, in days. Buckets: Not due (0 or "
                       "less), 1–30, 31–60, 61–90, 90+. The bucket totals add up to the grand "
                       "total (check cell = 0).", compiler=COMPILER_VERSION,
                       inputs={"as_at": when.isoformat(), "kind": kind, "items": len(lines)}),
    }
    compiled = compile_ar_ap_aging(AgingContract(
        client_name=ctx.client_name, period_label=_period(ctx, period_label), as_at=when,
        kind=kind, items=[{"party": x["party"], "reference": x["reference"],
                           "amount": x["amount"], "due_date": x["due_date"]} for x in lines]))
    noun = "receivables" if kind == "receivables" else "payables"
    summary = (f"{noun.capitalize()} {grand:,.2f} at {when.isoformat()}: not due "
               f"{totals['not_due']:,.2f}, 1–30 {totals['b1_30']:,.2f}, 31–60 "
               f"{totals['b31_60']:,.2f}, 61–90 {totals['b61_90']:,.2f}, 90+ "
               f"{totals['b90_plus']:,.2f}. Overdue {overdue:,.2f}.")
    return _out(ctx, compiled, "ar_ap_aging", f"{noun.capitalize()} aging as a new sheet",
                new_sheet_name or ("Debtors aging" if kind == "receivables" else
                                   "Creditors aging"), data, summary, cited)


# --- 2. WHT schedule ----------------------------------------------------------------
def wht_schedule(ctx: ToolContext, *, lines: list[dict[str, Any]] | None = None,
                 credit_notes: list[dict[str, Any]] | None = None, sheet: str | None = None,
                 workbook_id: str | None = None, vendor_column: str | None = None,
                 category_column: str | None = None, payee_type_column: str | None = None,
                 gross_column: str | None = None, default_category: str | None = None,
                 default_payee_type: str = "corporate", period_label: str | None = None,
                 new_sheet_name: str | None = None) -> ToolOutput:
    from litchai.compilers.wht import COMPILER_VERSION, compile_wht_schedule
    from litchai.contracts.wht import WhtScheduleContract

    cfg = load_tax_config()
    rates_cfg = cfg["wht"]["rates"]
    limit = cfg["wht"]["smallSupplierExemption"]["maxMonthlyPayment"]
    cited: list[str] = []
    if lines is None:
        rows, _s, rng = sheet_rows(ctx, sheet, workbook_id, {
            "vendor": (vendor_column, ("vendor", "supplier", "payee", "name"), True),
            "category": (category_column, ("category", "nature", "type of payment",
                                           "payment type", "type"), default_category is None),
            "payee_type": (payee_type_column, ("payee type", "entity", "company",
                                               "individual"), False),
            "gross_amount": (gross_column, ("gross", "amount", "invoice"), True),
            "date": (None, ("date",), False),
        })
        # A yes/no column such as "Vendor is a company" gives the payee type.
        _wb, _sh, table = ctx.find_sheet(sheet, workbook_id)
        flag_col = next((c.name.lower() for c in table.columns
                         if "company" in c.name.lower() or "individual" in c.name.lower()), "")
        for r in rows:
            v = r.get("payee_type")
            if isinstance(v, str) and v.strip().lower() in ("yes", "no", "y", "n", "true",
                                                             "false"):
                is_yes = _flag(v)
                company = is_yes if "company" in flag_col else not is_yes
                r["payee_type"] = "corporate" if company else "individual"
        lines, cited = rows, [rng]
    out, used = [], {}
    for i, ln in enumerate(lines, start=1):
        cat = str(ln.get("category") or default_category or "").strip().lower()
        if cat not in rates_cfg:
            raise ToolError(f"line {i}: unknown WHT category {cat!r} "
                            f"(valid: {sorted(rates_cfg)})")
        payee = str(ln.get("payee_type") or default_payee_type).strip().lower()
        payee = "individual" if payee.startswith("ind") else "corporate"
        gross = _money(ln.get("gross_amount"), f"line {i} gross_amount")
        exempt = _flag(ln.get("exempt", False))
        pct = rates_cfg[cat][f"{payee}Pct"]
        used[f"{cat}/{payee}"] = pct
        wht = 0.0 if exempt else round(gross * pct / 100, 2)
        when = ln.get("date")
        month = None
        if when not in (None, ""):
            try:
                month = _as_date(when, "date").strftime("%Y-%m")
            except ToolError:
                month = None
        out.append({"vendor": str(ln.get("vendor") or f"Line {i}"), "category": cat,
                    "payee_type": payee, "gross_amount": gross, "rate_pct": pct, "wht": wht,
                    "exempt": exempt, "month": month})
    # Small-supplier rule: a vendor paid limit or less in a month (per payment when
    # there is no date). Flagged for review only; the WHT stays in the schedule.
    per_month: dict[tuple[str, str], float] = {}
    for x in out:
        key = (x["vendor"], x["month"] or f"line-{id(x)}")
        per_month[key] = per_month.get(key, 0.0) + x["gross_amount"]
    for x in out:
        key = (x["vendor"], x["month"] or f"line-{id(x)}")
        x["small_supplier_candidate"] = (not x["exempt"]) and per_month[key] <= limit
    notes = credit_notes or []
    total = round(sum(x["wht"] for x in out), 2)
    by_cat: dict[str, float] = {}
    for x in out:
        by_cat[x["category"]] = round(by_cat.get(x["category"], 0.0) + x["wht"], 2)
    cn_total = round(sum(_money(n.get("amount"), "credit note amount") for n in notes), 2)
    candidates = list(dict.fromkeys(x["vendor"] for x in out if x["small_supplier_candidate"]))
    data = {
        "total_wht": total, "to_remit": total, "by_category": by_cat,
        "credit_notes_total": cn_total, "credit_notes_to_request": round(total - cn_total, 2),
        "small_supplier_candidates": candidates[:TOP_ROWS], "lines": out[:TOP_ROWS],
        "basis": basis("WHT = gross amount × the rate for the payment category and payee type "
                       "(company or individual). Exempt lines carry no WHT. Credit notes to "
                       "request = WHT deducted minus credit notes already received.",
                       compiler=COMPILER_VERSION, rates=used,
                       inputs={"lines": len(out), "credit_notes": len(notes)},
                       assumptions=[(f"Payments of ₦{limit:,.0f} or less a month may qualify "
                                    "for the small-supplier exemption. They are flagged, never "
                                    "exempted automatically.")]),
    }
    compiled = compile_wht_schedule(WhtScheduleContract(
        client_name=ctx.client_name, period_label=_period(ctx, period_label),
        deductions=[{k: x[k] for k in ("vendor", "category", "payee_type", "gross_amount",
                                       "exempt")} for x in out],
        credit_notes=[{"reference": str(n.get("reference") or f"CN {i}"),
                       "vendor": str(n.get("vendor") or ""), "amount": _money(n.get("amount"), "")}
                      for i, n in enumerate(notes, start=1)]))
    summary = (f"WHT to remit {total:,.2f} on {len(out)} payments; credit notes received "
               f"{cn_total:,.2f}, still to request {total - cn_total:,.2f}"
               + (f"; {len(candidates)} small-supplier candidate(s) to review." if candidates
                  else "."))
    return _out(ctx, compiled, "wht_schedule", "WHT schedule as a new sheet",
                new_sheet_name or "WHT schedule", data, summary, cited)


# --- 3. VAT return ------------------------------------------------------------------
_VAT_TYPES = {"standard": "standard_rated_sales", "sale": "standard_rated_sales",
              "sales": "standard_rated_sales", "output": "standard_rated_sales",
              "zero": "zero_rated_sales", "zero-rated": "zero_rated_sales",
              "exempt": "exempt_sales", "purchase": "standard_rated_purchases",
              "purchases": "standard_rated_purchases", "input": "standard_rated_purchases"}


def vat_return(ctx: ToolContext, *, standard_rated_sales: list[dict[str, Any]] | None = None,
               zero_rated_sales: list[dict[str, Any]] | None = None,
               exempt_sales: list[dict[str, Any]] | None = None,
               standard_rated_purchases: list[dict[str, Any]] | None = None,
               vat_credit_brought_forward: float = 0.0, sheet: str | None = None,
               workbook_id: str | None = None, type_column: str | None = None,
               amount_column: str | None = None, label_column: str | None = None,
               date_column: str | None = None, tin: str | None = None,
               period_label: str | None = None, new_sheet_name: str | None = None
               ) -> ToolOutput:
    from litchai.compilers.vat import COMPILER_VERSION, compile_vat_return
    from litchai.contracts.vat import VatReturnContract

    rate = load_tax_config()["vat"]["standardRatePct"]
    groups: dict[str, list[dict[str, Any]]] = {
        "standard_rated_sales": list(standard_rated_sales or []),
        "zero_rated_sales": list(zero_rated_sales or []),
        "exempt_sales": list(exempt_sales or []),
        "standard_rated_purchases": list(standard_rated_purchases or [])}
    cited: list[str] = []
    monthly: dict[str, dict[str, float]] = {}
    if sheet is not None or not any(groups.values()):
        rows, _s, rng = sheet_rows(ctx, sheet, workbook_id, {
            "type": (type_column, ("vat type", "vat", "type", "class"), True),
            "net_amount": (amount_column, ("net", "amount", "value"), True),
            "label": (label_column, ("description", "narration", "label", "item"), False),
            "date": (date_column, ("date",), False),
        })
        cited = [rng]
        for i, r in enumerate(rows, start=1):
            t = str(r.get("type") or "").strip().lower()
            group = _VAT_TYPES.get(t) or _VAT_TYPES.get(t.split()[0] if t else "")
            if group is None:
                raise ToolError(f"row {r['_row']}: VAT type {r.get('type')!r} is not one of "
                                "standard / zero / exempt / purchase")
            amt = _money(r.get("net_amount"), f"row {r['_row']} amount")
            groups[group].append({"label": str(r.get("label") or f"Row {r['_row']}"),
                                  "net_amount": amt})
            if r.get("date") not in (None, ""):
                m = _as_date(r["date"], f"row {r['_row']} date").strftime("%Y-%m")
                bucket = monthly.setdefault(m, {"output_vat": 0.0, "input_vat": 0.0})
                if group == "standard_rated_sales":
                    bucket["output_vat"] = round(bucket["output_vat"] + amt * rate / 100, 2)
                elif group == "standard_rated_purchases":
                    bucket["input_vat"] = round(bucket["input_vat"] + amt * rate / 100, 2)

    def total(g: str) -> float:
        return round(sum(_money(x.get("net_amount"), f"{g} net_amount") for x in groups[g]), 2)

    sales, zero, exempt, purchases = (total(g) for g in groups)
    output, inp = round(sales * rate / 100, 2), round(purchases * rate / 100, 2)
    credit = float(vat_credit_brought_forward or 0)
    net = round(output - inp - credit, 2)
    data = {
        "rate_pct": rate, "standard_rated_sales": sales, "zero_rated_sales": zero,
        "exempt_sales": exempt, "standard_rated_purchases": purchases, "output_vat": output,
        "input_vat": inp, "credit_brought_forward": credit, "net_payable": net,
        "position": "payable" if net > 0 else "refund or credit carried forward" if net < 0
        else "nil",
        "monthly": dict(sorted(monthly.items())),
        "basis": basis("Output VAT = standard-rated sales × the VAT rate; input VAT = "
                       "standard-rated purchases × the rate. Zero-rated and exempt sales carry "
                       "no output VAT but are disclosed. Net payable = output − input − credit "
                       "brought forward.", compiler=COMPILER_VERSION,
                       rates={"vat_standard_pct": rate},
                       inputs={g: len(v) for g, v in groups.items()},
                       assumptions=["Amounts are net of VAT (VAT-exclusive)."]),
    }
    compiled = compile_vat_return(VatReturnContract(
        client_name=ctx.client_name, period_label=_period(ctx, period_label), tin=tin,
        vat_credit_brought_forward=credit,
        **{g: [{"label": str(x.get("label") or g), "net_amount": _money(x.get("net_amount"), g)}
               for x in v] for g, v in groups.items()}))
    summary = (f"Output VAT {output:,.2f} (on {sales:,.2f} at {rate}%), input VAT {inp:,.2f}, "
               f"credit b/f {credit:,.2f}: net VAT {'payable' if net >= 0 else 'credit'} "
               f"{abs(net):,.2f}.")
    return _out(ctx, compiled, "vat_return", "VAT return as a new sheet",
                new_sheet_name or "VAT return", data, summary, cited)


# --- 4. Payroll schedule ------------------------------------------------------------
def payroll_schedule(ctx: ToolContext, *, employees: list[dict[str, Any]] | None = None,
                     sheet: str | None = None, workbook_id: str | None = None,
                     name_column: str | None = None, gross_column: str | None = None,
                     gross_is_monthly: bool = False, pension: bool = True, nhf: bool = False,
                     period_label: str | None = None, new_sheet_name: str | None = None
                     ) -> ToolOutput:
    from litchai.compilers.payroll import COMPILER_VERSION, compile_payroll
    from litchai.contracts.payroll import PayrollContract
    from litchai.workbench.analysis import paye_annual

    cfg = load_tax_config()
    pr = cfg["payroll"]
    cited: list[str] = []
    if employees is None:
        rows, _s, rng = sheet_rows(ctx, sheet, workbook_id, {
            "name": (name_column, ("employee", "name", "staff"), True),
            "gross_annual": (gross_column, ("gross", "salary", "pay"), True),
            "pension": (None, ("pension",), False),
            "nhf": (None, ("nhf", "housing fund"), False),
        })
        _wb, _sh, table = ctx.find_sheet(sheet, workbook_id)
        gross_head = next((c.name.lower() for c in table.columns
                           if (gross_column and c.name.lower() == gross_column.lower())
                           or any(w in c.name.lower() for w in ("gross", "salary", "pay"))), "")
        if "month" in gross_head:
            gross_is_monthly = True
        employees, cited = rows, [rng]
    if not employees:
        raise ToolError("no employees found")
    out = []
    for i, e in enumerate(employees, start=1):
        gross = _money(e.get("gross_annual"), f"employee {i} gross")
        gross = gross * 12 if gross_is_monthly else gross
        has_pension = _flag(e.get("pension", pension))
        has_nhf = _flag(e.get("nhf", nhf))
        pen = round(gross * pr["pension"]["employeePct"] / 100, 2) if has_pension else 0.0
        nh = round(gross * pr["nhf"]["employeePct"] / 100, 2) if has_nhf else 0.0
        chargeable = round(gross - pen - nh, 2)
        paye, _bands = paye_annual(cfg, chargeable)
        out.append({"name": str(e.get("name") or f"Employee {i}"), "gross_annual": gross,
                    "pension": pen, "nhf": nh, "chargeable": chargeable, "paye": paye,
                    "net_pay": round(gross - pen - nh - paye, 2),
                    "employer_pension": round(gross * pr["pension"]["employerPct"] / 100, 2),
                    "nsitf": round(gross * pr["nsitf"]["employerPct"] / 100, 2),
                    "pension_on": has_pension, "nhf_on": has_nhf})

    def tot(k: str) -> float:
        return round(sum(x[k] for x in out), 2)

    totals = {k: tot(k) for k in ("gross_annual", "pension", "nhf", "paye", "net_pay",
                                  "employer_pension", "nsitf")}
    employer_cost = round(totals["gross_annual"] + totals["employer_pension"] + totals["nsitf"], 2)
    data = {
        "employees": len(out), "totals": totals, "employer_cost": employer_cost,
        "monthly": {k: round(v / 12, 2) for k, v in totals.items()},
        "lines": out[:TOP_ROWS],
        "basis": basis("Chargeable income = gross − employee pension − NHF. PAYE uses the "
                       "progressive bands in the tax config on chargeable income. Net pay = "
                       "gross − pension − NHF − PAYE. Employer cost = gross + employer pension "
                       "+ NSITF.", compiler=COMPILER_VERSION,
                       rates={"pension_employee_pct": pr["pension"]["employeePct"],
                              "pension_employer_pct": pr["pension"]["employerPct"],
                              "nhf_pct": pr["nhf"]["employeePct"],
                              "nsitf_pct": pr["nsitf"]["employerPct"],
                              "paye_bands": [(b["label"], b["ratePct"])
                                             for b in cfg["paye"]["bands"]]},
                       inputs={"employees": len(out), "gross_is_monthly": gross_is_monthly},
                       assumptions=[("Annual figures; monthly = annual ÷ 12. Rent relief is not "
                                    "in this schedule (use tax_compute kind=paye with rent_paid).")]),
    }
    compiled = compile_payroll(PayrollContract(
        client_name=ctx.client_name, period_label=_period(ctx, period_label),
        employees=[{"name": x["name"], "gross_annual": x["gross_annual"],
                    "pension": x["pension_on"], "nhf": x["nhf_on"]} for x in out]))
    m = data["monthly"]
    summary = (f"Payroll for {len(out)} staff. Monthly: gross {m['gross_annual']:,.2f}, PAYE "
               f"{m['paye']:,.2f}, pension {m['pension']:,.2f}, NHF {m['nhf']:,.2f}, net pay "
               f"{m['net_pay']:,.2f}. Annual: gross {totals['gross_annual']:,.2f}, PAYE "
               f"{totals['paye']:,.2f}; employer cost {employer_cost:,.2f}."
               + (" Gross pay was read as monthly." if gross_is_monthly else ""))
    return _out(ctx, compiled, "payroll_schedule", "Payroll schedule as a new sheet",
                new_sheet_name or "Payroll", data, summary, cited)


# --- 5. Statement of affairs --------------------------------------------------------
_SOA_GROUPS = {  # (words a class starts with, exact abbreviations)
    "non_current_assets": (("non-current asset", "non current asset", "fixed asset"), ("nca",)),
    "non_current_liabilities": (("non-current liabilit", "non current liabilit",
                                 "long-term liabilit"), ("ncl",)),
    "current_assets": (("current asset",), ("ca",)),
    "current_liabilities": (("current liabilit",), ("cl",)),
    "equity": (("equity", "capital", "share capital", "reserve", "retained"), ()),
}


def _soa_group(text: str) -> str | None:
    t = text.strip().lower()
    for g, (words, exact) in _SOA_GROUPS.items():
        if t in exact or any(t.startswith(w) for w in words):
            return g
    return None


def statement_of_affairs(ctx: ToolContext, *, as_at_label: str,
                         non_current_assets: list[dict[str, Any]] | None = None,
                         current_assets: list[dict[str, Any]] | None = None,
                         current_liabilities: list[dict[str, Any]] | None = None,
                         non_current_liabilities: list[dict[str, Any]] | None = None,
                         equity: list[dict[str, Any]] | None = None, sheet: str | None = None,
                         workbook_id: str | None = None, label_column: str | None = None,
                         group_column: str | None = None, amount_column: str | None = None,
                         new_sheet_name: str | None = None) -> ToolOutput:
    from litchai.compilers.statement_of_affairs import (
        COMPILER_VERSION,
        compile_statement_of_affairs,
    )
    from litchai.contracts.statement_of_affairs import StatementOfAffairsContract

    groups = {"non_current_assets": list(non_current_assets or []),
              "current_assets": list(current_assets or []),
              "current_liabilities": list(current_liabilities or []),
              "non_current_liabilities": list(non_current_liabilities or []),
              "equity": list(equity or [])}
    cited: list[str] = []
    if sheet is not None or not any(groups.values()):
        rows, _s, rng = sheet_rows(ctx, sheet, workbook_id, {
            "label": (label_column, ("account", "item", "description", "label", "name"), True),
            "group": (group_column, ("class", "group", "type", "category"), True),
            "amount": (amount_column, ("amount", "balance", "value"), True),
        })
        cited = [rng]
        for r in rows:
            g = _soa_group(str(r.get("group") or ""))
            if g is None:
                raise ToolError(f"row {r['_row']}: class {r.get('group')!r} is not an asset, "
                                "liability or equity group")
            groups[g].append({"label": str(r.get("label")), "amount": r.get("amount")})
    tot = {g: round(sum(_money(x.get("amount"), f"{g} amount") for x in v), 2)
           for g, v in groups.items()}
    assets = round(tot["non_current_assets"] + tot["current_assets"], 2)
    liabilities = round(tot["current_liabilities"] + tot["non_current_liabilities"], 2)
    net_assets = round(assets - liabilities, 2)
    check = round(net_assets - tot["equity"], 2)
    data = {**{f"total_{g}": v for g, v in tot.items()}, "total_assets": assets,
            "total_liabilities": liabilities, "net_assets": net_assets,
            "total_equity": tot["equity"], "balance_check": check, "balances": check == 0,
            "basis": basis("Net assets = total assets − total liabilities; it must equal total "
                           "equity (balance check = 0).", compiler=COMPILER_VERSION,
                           source="statement of affairs layout (simple balance sheet)",
                           inputs={g: len(v) for g, v in groups.items()})}
    compiled = compile_statement_of_affairs(StatementOfAffairsContract(
        client_name=ctx.client_name, as_at_label=as_at_label,
        **{g: [{"label": str(x.get("label") or g), "amount": _money(x.get("amount"), g)}
               for x in v] for g, v in groups.items()}))
    summary = (f"Total assets {assets:,.2f}, total liabilities {liabilities:,.2f}, net assets "
               f"{net_assets:,.2f}, equity {tot['equity']:,.2f}: "
               + ("balances." if check == 0 else f"does NOT balance (difference {check:,.2f})."))
    return _out(ctx, compiled, "statement_of_affairs", "Statement of affairs as a new sheet",
                new_sheet_name or "Statement of affairs", data, summary, cited)


# --- 6. CAC / compliance tracker ----------------------------------------------------
def cac_filing_tracker(ctx: ToolContext, *, as_at: str, items: list[dict[str, Any]] | None = None,
                       sheet: str | None = None, workbook_id: str | None = None,
                       requirement_column: str | None = None, due_column: str | None = None,
                       completed_column: str | None = None, fee_column: str | None = None,
                       authority_column: str | None = None, rc_number: str | None = None,
                       tin: str | None = None, period_label: str | None = None,
                       new_sheet_name: str | None = None) -> ToolOutput:
    from litchai.compilers.cac_tracker import COMPILER_VERSION, compile_cac_tracker
    from litchai.contracts.cac_tracker import CacTrackerContract

    when = _as_date(as_at, "as_at")
    cited: list[str] = []
    if items is None:
        rows, _s, rng = sheet_rows(ctx, sheet, workbook_id, {
            "requirement": (requirement_column, ("requirement", "filing", "obligation",
                                                 "item", "description"), True),
            "authority": (authority_column, ("authority", "agency", "regulator"), False),
            "due_date": (due_column, ("due",), True),
            "completed": (completed_column, ("completed", "done", "filed", "status"), False),
            "fee": (fee_column, ("fee", "cost", "amount"), False),
        })
        items, cited = rows, [rng]
    lines = []
    for i, it in enumerate(items, start=1):
        due = _as_date(it.get("due_date"), f"item {i} due_date")
        done = _flag(it.get("completed", False))
        fee = _money(it.get("fee") or 0, f"item {i} fee")
        lines.append({"requirement": str(it.get("requirement") or f"Item {i}"),
                      "authority": str(it.get("authority") or "CAC"), "due_date": due,
                      "completed": done, "fee": fee, "overdue": (not done and due < when),
                      "days_to_due": (due - when).days})
    n = len(lines)
    done_n = sum(1 for x in lines if x["completed"])
    overdue = [x for x in lines if x["overdue"]]
    upcoming = sorted((x for x in lines if not x["completed"] and not x["overdue"]),
                      key=lambda x: x["due_date"])[:5]
    data = {
        "as_at": when.isoformat(), "total_items": n, "completed_count": done_n,
        "outstanding_count": n - done_n, "overdue_count": len(overdue),
        "completion_pct": round(done_n / n * 100, 1) if n else 0.0,
        "total_fees": round(sum(x["fee"] for x in lines), 2),
        "outstanding_fees": round(sum(x["fee"] for x in lines if not x["completed"]), 2),
        "overdue": [{"requirement": x["requirement"], "due_date": x["due_date"].isoformat(),
                     "days_late": -x["days_to_due"]} for x in overdue[:TOP_ROWS]],
        "next_due": [{"requirement": x["requirement"], "due_date": x["due_date"].isoformat(),
                      "days_to_due": x["days_to_due"]} for x in upcoming],
        "basis": basis("An item is overdue when it is not completed and its due date is before "
                       "the as-at date. Completion % = completed ÷ total × 100. Outstanding fees "
                       "= fees of items not completed.", compiler=COMPILER_VERSION,
                       source="the due dates given (check them against CAC / NRS notices)",
                       inputs={"as_at": when.isoformat(), "items": n}),
    }
    compiled = compile_cac_tracker(CacTrackerContract(
        client_name=ctx.client_name, period_label=_period(ctx, period_label), as_at=when,
        rc_number=rc_number, tin=tin,
        items=[{k: x[k] for k in ("requirement", "authority", "due_date", "completed", "fee")}
               for x in lines]))
    summary = (f"{done_n} of {n} filings done ({data['completion_pct']}%); {len(overdue)} "
               f"overdue; outstanding fees {data['outstanding_fees']:,.2f}"
               + (f"; next due: {upcoming[0]['requirement']} on "
                  f"{upcoming[0]['due_date'].isoformat()}." if upcoming else "."))
    return _out(ctx, compiled, "cac_filing_tracker", "Compliance tracker as a new sheet",
                new_sheet_name or "Compliance tracker", data, summary, cited)


# --- 7. Annual report pack ----------------------------------------------------------
def annual_report_pack(ctx: ToolContext, *, contract: dict[str, Any],
                       standard: str | None = None) -> ToolOutput:
    from pydantic import TypeAdapter, ValidationError

    from litchai.compilers.annual_report import COMPILER_VERSION, compile_annual_report
    from litchai.contracts.annual_report import AnnualReportContract
    from litchai.workbench.formula import safe_preview
    from litchai.workbench.model import load_xlsx

    body = dict(contract)
    if standard:
        body["standard"] = standard
    body.setdefault("client_name", ctx.client_name)
    try:
        parsed = TypeAdapter(AnnualReportContract).validate_python(body)
    except ValidationError as exc:
        msgs = "; ".join(f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}"
                         for e in exc.errors()[:6])
        raise ToolError(f"the annual-report inputs are incomplete: {msgs}") from exc
    compiled = compile_annual_report(parsed)
    # Figures: the pipeline evaluates the pack's own formulas (the recompute gate
    # confirms them on accept).
    buf = io.BytesIO()
    compiled.workbook.save(buf)
    model = load_xlsx(buf.getvalue(), wb_id="pack", name="pack")
    from litchai.compilers._common import split_sheet_ref

    figures: dict[str, Any] = {}
    wanted = [k for k in compiled.key_cells if not k.endswith(":py")]
    for k in wanted[:60]:
        sheet, cell = split_sheet_ref(compiled.key_cells[k])
        c = model.sheets[sheet].get(*parse_a1(cell)) if sheet in model.sheets else None
        if c is None:
            continue
        figures[k] = safe_preview(model, sheet, c.formula) if c.formula else c.value
    std = "IAS 1" if parsed.standard == "ias1" else "IFRS 18"
    data = {
        "standard": parsed.standard, "figures": figures,
        "basis": basis(f"Primary statements and notes under {std}: SOFP, P&L, cash flows "
                       "(indirect), schedules and bank reconciliation, all as linked "
                       "formulas.", compiler=COMPILER_VERSION, source=std,
                       inputs={"period": parsed.period_label, "as_at": parsed.as_at_label},
                       assumptions=[("Amounts in ₦'000 as given. The recompute check confirms "
                                    "every figure when you accept.")]),
    }
    checks = {k: v for k, v in figures.items() if "check" in k}
    bad = {k: v for k, v in checks.items() if isinstance(v, (int, float)) and abs(v) > 0.5}
    summary = (f"{std} annual report pack ({len(compiled.workbook.worksheets)} sheets) proposed"
               + (f"; balance checks NOT zero: {bad}." if bad else
                  "; balance checks are zero." if checks else "."))
    return _out(ctx, compiled, "annual_report_pack", f"{std} annual report pack", None, data,
                summary, [], all_sheets=True)

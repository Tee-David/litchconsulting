"""Deterministic write tools: categorise, statements, pivots, formula columns.

Every figure is a formula over the source rows (SUMIFS by category, direct
cell links) — the statement updates when the ledger changes, and the "why"
popover can show exactly which rows fed a number. The template compilers in
:mod:`litchai.compilers` lay statements out, so the workbench output matches
the firm's deliverables; we only swap their literal line amounts for links.
"""
from __future__ import annotations

from collections import OrderedDict, deque
from typing import Any

from litchai.categorize import normalize_narration
from litchai.compilers._common import NAIRA_FMT
from litchai.taxconfig import load_tax_config
from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.formula import FormulaError, check_formula
from litchai.workbench.model import Sheet, Workbook, a1, qualify, to_number
from litchai.workbench.ops import OpBuilder
from litchai.workbench.tables import Column, Table

# --- taxonomy helpers --------------------------------------------------------------


def code_for(text: Any, taxonomy: Any) -> str | None:
    if text is None or taxonomy is None:
        return None
    s = str(text).strip()
    if not s:
        return None
    by_code = taxonomy.by_code()
    if s in by_code:
        return s
    low = s.lower()
    for c in taxonomy.categories:
        if c.label.lower() == low or any(t.lower() == low for t in c.template_labels):
            return c.code
    return None


def label_for(code: str, taxonomy: Any) -> str:
    cat = taxonomy.by_code().get(code) if taxonomy else None
    return cat.label if cat else code


def keyword_categoriser(taxonomy: Any):
    """Fallback rung when no memory store is wired: taxonomy keyword match."""
    leaves = [c for c in taxonomy.postable_leaves() if c.keywords]

    def classify(normalized: str) -> tuple[str, str | None, float]:
        text = normalized.upper()
        for c in leaves:
            if any(k in text for k in c.keywords):
                return c.code, "keyword", 0.6
        return "suspense.uncategorized", None, 0.0

    return classify


# --- range helpers -----------------------------------------------------------------
def col_range(sheet: Sheet, table: Table, col: Column) -> str:
    return qualify(sheet.name, f"${col.letter}${table.first_row}:${col.letter}${table.last_row}")


def _target_column(sheet: Sheet, table: Table, header: str) -> int:
    existing = table.col(header)
    if existing is not None and existing.name.strip().lower() == header.strip().lower():
        return existing.index
    return max(sheet.max_col, table.columns[-1].index) + 1


# --- categorise_rows -----------------------------------------------------------------
def categorise_rows(ctx: ToolContext, *, sheet: str | None = None, workbook_id: str | None = None,
                    description_column: str | None = None, header: str = "Category",
                    only_blank: bool = True) -> ToolOutput:
    if ctx.taxonomy is None:
        raise ToolError("taxonomy not loaded")
    wb, sh, table = ctx.find_sheet(sheet, workbook_id,
                                   prefer=lambda t: t.col("description") is not None)
    desc = table.col(description_column) if description_column else table.col("description")
    if desc is None:
        raise ToolError("no description/narration column found; name it with description_column")
    classify = ctx.categoriser or keyword_categoriser(ctx.taxonomy)
    target = _target_column(sh, table, header)
    b = OpBuilder(wb, "categorise_rows")
    b.set(sh.name, a1(table.header_row, target), value=header, reason="Category column header")
    cache: dict[str, tuple[str, str | None, float]] = {}
    counts: dict[str, int] = {}
    review: list[str] = []
    by_source: dict[str, int] = {}
    for r in range(table.first_row, table.last_row + 1):
        raw = sh.value(r, desc.index)
        if raw is None or not str(raw).strip():
            continue
        current = sh.value(r, target)
        if only_blank and current not in (None, ""):
            continue
        norm = normalize_narration(str(raw))
        if norm not in cache:
            cache[norm] = classify(norm)
        code, source, conf = cache[norm]
        label = label_for(code, ctx.taxonomy)
        counts[label] = counts.get(label, 0) + 1
        by_source[source or "unresolved"] = by_source.get(source or "unresolved", 0) + 1
        if source is None or code == "suspense.uncategorized" or conf < 0.7:
            review.append(a1(r, target))
        b.set(sh.name, a1(r, target), value=label,
              reason=f"{source or 'unresolved'} · confidence {conf:.2f}",
              source_rows=[qualify(sh.name, a1(r, desc.index))])
    if len(b.ops) <= 1:
        raise ToolError("nothing to categorise (all rows already have a category)")
    n = len(b.ops) - 1
    batch = finish_batch(ctx, b, f"Categorise {n} rows on {sh.name}",
                         f"{qualify(sh.name, a1(table.first_row, target))} down · "
                         f"{len(review)} need review")
    return ToolOutput(
        data={"sheet": sh.name, "column": a1(table.header_row, target)[:-len(str(table.header_row))],
              "rows": n, "by_category": counts, "by_source": by_source,
              "needs_review": review[:50], "needs_review_count": len(review)},
        batch=batch, summary=f"Proposed categories for {n} rows; {len(review)} need review.",
    )


# --- statements ------------------------------------------------------------------------
_PNL_BUCKET = (
    ("revenue.", "revenue"), ("cos.", "cost_of_sales"), ("dist.", "operating_expenses"),
    ("admin.", "operating_expenses"), ("bank.", "operating_expenses"),
    ("other_expenses.", "operating_expenses"), ("finance.costs", "operating_expenses"),
    ("other_income.", "other_income"), ("finance.income", "other_income"),
)
_CF_ACTIVITY = (("capex.", "investing"), ("fin_activity.", "financing"))


class _Source:
    """Signed-amount SUMIFS builders over one categorised table."""

    def __init__(self, sh: Sheet, table: Table, cat: Column) -> None:
        self.sh, self.table, self.cat = sh, table, cat
        self.cr, self.dr, self.amt = table.col("credit"), table.col("debit"), table.col("amount")
        if not (self.cr or self.dr or self.amt):
            raise ToolError(f"{sh.name} has no amount / debit / credit column")
        self.cat_rng = col_range(sh, table, cat)

    def sumifs(self, raw_labels: list[str], *, inflow_positive: bool, part: str = "net") -> str:
        """Formula summing the rows tagged with any of ``raw_labels``. part:
        'net' | 'in' (receipts only) | 'out' (payments only, positive)."""
        terms = []
        for lab in raw_labels:
            crit = '"' + str(lab).replace('"', '""') + '"'
            if self.cr or self.dr:
                cr = (f"SUMIFS({col_range(self.sh, self.table, self.cr)},{self.cat_rng},{crit})"
                      if self.cr else "0")
                dr = (f"SUMIFS({col_range(self.sh, self.table, self.dr)},{self.cat_rng},{crit})"
                      if self.dr else "0")
                if part == "in":
                    terms.append(cr)
                elif part == "out":
                    terms.append(dr)
                else:
                    terms.append(f"{cr}-{dr}" if inflow_positive else f"{dr}-{cr}")
            else:
                rng = col_range(self.sh, self.table, self.amt)
                if part == "in":
                    terms.append(f'SUMIFS({rng},{self.cat_rng},{crit},{rng},">0")')
                elif part == "out":
                    terms.append(f'-SUMIFS({rng},{self.cat_rng},{crit},{rng},"<0")')
                else:
                    s = f"SUMIFS({rng},{self.cat_rng},{crit})"
                    terms.append(s if inflow_positive else f"-{s}")
        return "=" + "+".join(f"({t})" for t in terms)

    def python_sum(self, raw_labels: set[str], *, inflow_positive: bool, part: str = "net") -> float:
        total = 0.0
        for r in range(self.table.first_row, self.table.last_row + 1):
            if str(self.sh.value(r, self.cat.index) or "").strip() not in raw_labels:
                continue
            a = self.table.amount(self.sh, r)
            if a is None:
                continue
            if part == "in":
                total += max(a, 0)
            elif part == "out":
                total += max(-a, 0)
            else:
                total += a if inflow_positive else -a
        return round(total, 2)


def _group_by_code(sh: Sheet, table: Table, cat: Column, taxonomy: Any) -> tuple[
        OrderedDict[str, list[str]], list[str]]:
    groups: OrderedDict[str, list[str]] = OrderedDict()
    unknown: list[str] = []
    for r in range(table.first_row, table.last_row + 1):
        raw = sh.value(r, cat.index)
        if raw is None or not str(raw).strip():
            continue
        raw_s = str(raw).strip()
        code = code_for(raw_s, taxonomy)
        if code is None:
            if raw_s not in unknown:
                unknown.append(raw_s)
            continue
        labels = groups.setdefault(code, [])
        if raw_s not in labels:
            labels.append(raw_s)
    return OrderedDict(sorted(groups.items())), unknown


def _copy_compiled(b: OpBuilder, compiled_ws: Any, target: str,
                   links: dict[str, deque[tuple[str, float, list[str]]]], amount_col: str,
                   label_col: str, reason: str) -> list[str]:
    """Copy a compiler's sheet into ops; line amounts become link formulas."""
    citations: list[str] = []
    for row in compiled_ws.iter_rows():
        for c in row:
            if c.value is None:
                continue
            ref = c.coordinate
            fmt = c.number_format if c.number_format != "General" else None
            if c.column_letter == amount_col and not (isinstance(c.value, str)
                                                      and c.value.startswith("=")):
                label = str(compiled_ws[f"{label_col}{c.row}"].value or "").strip()
                queue = links.get(label)
                if queue:
                    formula, preview, src = queue.popleft()
                    b.set(target, ref, formula=formula, preview=preview, reason=reason,
                          source_rows=src, number_format=fmt or NAIRA_FMT)
                    citations.append(qualify(target, ref))
                    continue
            if isinstance(c.value, str) and c.value.startswith("="):
                b.set(target, ref, formula=c.value, reason=reason, number_format=fmt)
            else:
                b.set(target, ref, value=c.value, reason=reason, number_format=fmt)
    return citations


def _source_rows(sh: Sheet, table: Table, cat: Column, labels: set[str]) -> list[str]:
    return [qualify(sh.name, a1(r, cat.index)) for r in range(table.first_row, table.last_row + 1)
            if str(sh.value(r, cat.index) or "").strip() in labels][:200]


def build_statement(ctx: ToolContext, *, kind: str, sheet: str | None = None,
                    workbook_id: str | None = None, new_sheet_name: str | None = None,
                    period_label: str | None = None, opening_cash: float | None = None,
                    category_column: str | None = None) -> ToolOutput:
    if kind not in ("pnl", "bs", "cashflow"):
        raise ToolError("kind must be pnl, bs or cashflow")
    if kind == "bs":
        return _build_bs(ctx, sheet=sheet, workbook_id=workbook_id,
                         new_sheet_name=new_sheet_name, period_label=period_label)
    wb, sh, table = ctx.find_sheet(sheet, workbook_id,
                                   prefer=lambda t: t.col("category") is not None)
    cat = table.col(category_column) if category_column else (
        table.col("category") or table.col("Category"))
    if cat is None:
        raise ToolError(f"{sh.name} has no Category column — run categorise_rows first")
    src = _Source(sh, table, cat)
    groups, unknown = _group_by_code(sh, table, cat, ctx.taxonomy)
    period = period_label or ctx.period_label or "Period"
    links: dict[str, deque] = {}
    excluded: dict[str, float] = {}

    def link(label: str, formula: str, preview: float, labels: set[str]) -> None:
        links.setdefault(label, deque()).append(
            (formula, preview, _source_rows(sh, table, cat, labels)))

    if kind == "pnl":
        from litchai.compilers.pnl import compile_pnl
        from litchai.contracts.pnl import LineItem, PnLContract

        buckets: dict[str, list] = {"revenue": [], "cost_of_sales": [],
                                    "operating_expenses": [], "other_income": []}
        for code, raw in groups.items():
            bucket = next((bk for prefix, bk in _PNL_BUCKET if code.startswith(prefix)), None)
            inflow = bucket in ("revenue", "other_income")
            value = src.python_sum(set(raw), inflow_positive=bool(inflow))
            if bucket is None:
                excluded[label_for(code, ctx.taxonomy)] = src.python_sum(set(raw),
                                                                         inflow_positive=True)
                continue
            label = label_for(code, ctx.taxonomy)
            buckets[bucket].append(LineItem(label=label, amount=value))
            link(label, src.sumifs(raw, inflow_positive=inflow), value, set(raw))
        if not buckets["revenue"]:
            raise ToolError("no revenue rows found — check the Category column")
        contract = PnLContract(client_name=ctx.client_name, period_label=period, **buckets)
        compiled = compile_pnl(contract)
        default_name = "P&L"
    else:
        from litchai.compilers.cashflow import compile_cashflow
        from litchai.contracts.cashflow import CashflowContract, CashLine

        flows: dict[str, list] = {f"{a}_{d}": [] for a in ("operating", "investing", "financing")
                                  for d in ("receipts", "payments")}
        for code, raw in groups.items():
            if code.startswith("transfers."):
                excluded[label_for(code, ctx.taxonomy)] = src.python_sum(set(raw),
                                                                         inflow_positive=True)
                continue
            activity = next((a for p, a in _CF_ACTIVITY if code.startswith(p)), "operating")
            label = label_for(code, ctx.taxonomy)
            for part, d in (("in", "receipts"), ("out", "payments")):
                v = src.python_sum(set(raw), inflow_positive=True, part=part)
                if v:
                    flows[f"{activity}_{d}"].append(CashLine(label=label, amount=v))
                    link(label, src.sumifs(raw, inflow_positive=True, part=part), v, set(raw))
        if opening_cash is None:
            opening_cash = _opening_cash(sh, table)
        contract = CashflowContract(client_name=ctx.client_name, period_label=period,
                                    opening_cash=float(opening_cash or 0.0), **flows)
        compiled = compile_cashflow(contract)
        default_name = "Cash Flow"

    b = OpBuilder(wb, "build_statement")
    target = b.create_sheet(new_sheet_name or default_name,
                            f"New {kind} statement built from {sh.name}")
    reason = f"build_statement {{{kind}}} from {sh.name}"
    cites = _copy_compiled(b, compiled.workbook.active, target, links, "C", "B", reason)
    batch = finish_batch(ctx, b, f"Build {default_name} as a new sheet",
                         f"{target} · {len(b.ops) - 1} cells, linked to {sh.name}")
    key = {k: qualify(target, v) for k, v in compiled.key_cells.items()}
    previews = {op.cell: op.preview_value for op in batch.ops if op.op == "set_cell"}
    figures = {k: previews.get(v) for k, v in compiled.key_cells.items()}
    return ToolOutput(
        data={"sheet": target, "kind": kind, "key_cells": key, "figures": figures,
              "excluded": excluded, "unmapped_categories": unknown,
              "compiler_version": compiled.compiler_version},
        batch=batch, citations=list(key.values()) + cites[:10],
        summary=f"{default_name} proposed on new sheet {target}.",
    )


def _opening_cash(sh: Sheet, table: Table) -> float | None:
    bal = table.col("balance")
    if bal is None:
        return None
    first = table.first_row
    b0 = to_number(sh.value(first, bal.index))
    a0 = table.amount(sh, first)
    if b0 is None:
        return None
    return round(b0 - (a0 or 0.0), 2)


_BS_CLASSES = (
    ("non_current_liabilities", ("non-current liab", "non current liab", "long-term", "long term",
                                 "term loan", "debenture")),
    ("current_liabilities", ("current liab", "payable", "accrual", "overdraft", "creditor",
                             "tax payable", "short-term loan")),
    ("non_current_assets", ("non-current asset", "non current asset", "fixed asset", "ppe",
                            "property", "plant", "equipment", "intangible", "investment property")),
    ("current_assets", ("current asset", "cash", "bank", "receivable", "debtor", "inventory",
                        "stock", "prepayment")),
    ("equity", ("equity", "capital", "retained", "reserve", "share")),
)


def bs_class(text: Any) -> str | None:
    t = str(text or "").strip().lower()
    for cls, hints in _BS_CLASSES:
        if any(h in t for h in hints):
            return cls
    return None


def _build_bs(ctx: ToolContext, *, sheet: str | None, workbook_id: str | None,
              new_sheet_name: str | None, period_label: str | None) -> ToolOutput:
    from litchai.compilers.statement_of_affairs import compile_statement_of_affairs
    from litchai.contracts.statement_of_affairs import BsLine, StatementOfAffairsContract

    wb, sh, table = ctx.find_sheet(sheet, workbook_id,
                                   prefer=lambda t: t.col("category") is not None)
    desc = table.col("description") or table.columns[0]
    cls_col = table.col("category")
    amount_col = table.col("amount") or table.col("balance")
    dr, cr = table.col("debit"), table.col("credit")
    if amount_col is None and not (dr or cr):
        raise ToolError(f"{sh.name} needs an amount / balance (or debit + credit) column")
    sections: dict[str, list] = {k: [] for k, _ in _BS_CLASSES}
    links: dict[str, deque] = {}
    skipped: list[str] = []
    for r in range(table.first_row, table.last_row + 1):
        label = sh.value(r, desc.index)
        if label is None:
            continue
        cls = bs_class(sh.value(r, cls_col.index)) if cls_col else None
        cls = cls or bs_class(label)
        if cls is None:
            skipped.append(qualify(sh.name, a1(r, desc.index)))
            continue
        liability_side = cls in ("current_liabilities", "non_current_liabilities", "equity")
        if amount_col is not None:
            ref = qualify(sh.name, a1(r, amount_col.index))
            value = to_number(sh.value(r, amount_col.index)) or 0.0
            formula = f"=ABS({ref})"
            value = abs(value)
        else:
            d = qualify(sh.name, a1(r, dr.index)) if dr else "0"
            c = qualify(sh.name, a1(r, cr.index)) if cr else "0"
            dv = to_number(sh.value(r, dr.index)) if dr else 0.0
            cv = to_number(sh.value(r, cr.index)) if cr else 0.0
            formula = f"={c}-{d}" if liability_side else f"={d}-{c}"
            value = ((cv or 0) - (dv or 0)) if liability_side else ((dv or 0) - (cv or 0))
        text = str(label).strip()
        sections[cls].append(BsLine(label=text, amount=round(value, 2)))
        links.setdefault(text, deque()).append(
            (formula, round(value, 2), [qualify(sh.name, a1(r, desc.index))]))
    if not any(sections.values()):
        raise ToolError("no balance-sheet lines recognised — add a class column "
                        "(e.g. 'Current assets', 'Equity')")
    contract = StatementOfAffairsContract(
        client_name=ctx.client_name, as_at_label=period_label or ctx.period_label or "As at",
        **sections)
    compiled = compile_statement_of_affairs(contract)
    b = OpBuilder(wb, "build_statement")
    target = b.create_sheet(new_sheet_name or "Balance Sheet",
                            f"New balance sheet built from {sh.name}")
    _copy_compiled(b, compiled.workbook.active, target, links, "C", "B",
                   f"build_statement {{bs}} from {sh.name}")
    batch = finish_batch(ctx, b, "Build Balance Sheet as a new sheet",
                         f"{target} · linked to {sh.name}")
    previews = {op.cell: op.preview_value for op in batch.ops if op.op == "set_cell"}
    key = {k: qualify(target, v) for k, v in compiled.key_cells.items()}
    return ToolOutput(
        data={"sheet": target, "kind": "bs", "key_cells": key,
              "figures": {k: previews.get(v) for k, v in compiled.key_cells.items()},
              "skipped_rows": skipped[:50], "compiler_version": compiled.compiler_version},
        batch=batch, citations=list(key.values()),
        summary=f"Balance sheet proposed on new sheet {target}.",
    )


# --- pivot ------------------------------------------------------------------------------
def pivot(ctx: ToolContext, *, rows_column: str, sheet: str | None = None,
          workbook_id: str | None = None, value_column: str | None = None,
          columns_column: str | None = None, agg: str = "sum",
          new_sheet_name: str | None = None, max_columns: int = 24) -> ToolOutput:
    """A SUMIFS/COUNTIFS formula table on a new sheet (not an Excel PivotTable —
    formulas recompute in every spreadsheet app and survive the gate)."""
    if agg not in ("sum", "count"):
        raise ToolError("agg must be sum or count")
    wb, sh, table = ctx.find_sheet(sheet, workbook_id)
    rc = table.col(rows_column)
    if rc is None:
        raise ToolError(f"no column {rows_column!r} on {sh.name}")
    cc = table.col(columns_column) if columns_column else None
    if columns_column and cc is None:
        raise ToolError(f"no column {columns_column!r} on {sh.name}")
    vc = table.col(value_column) if value_column else (table.col("amount") or table.col("credit"))
    dr, cr = table.col("debit"), table.col("credit")
    signed = value_column is None and table.col("amount") is None and (dr or cr)
    if agg == "sum" and vc is None and not signed:
        raise ToolError("no value column to sum")

    def distinct(col: Column) -> list[Any]:
        seen: OrderedDict[str, Any] = OrderedDict()
        for r in range(table.first_row, table.last_row + 1):
            v = sh.value(r, col.index)
            if v is not None and str(v).strip():
                seen.setdefault(str(v).strip(), v)
        return sorted(seen.values(), key=lambda x: str(x))

    row_keys = distinct(rc)
    col_keys = distinct(cc)[:max_columns] if cc else []
    rr = col_range(sh, table, rc)
    b = OpBuilder(wb, "pivot")
    target = b.create_sheet(new_sheet_name or f"{rc.name} summary"[:31],
                            f"Pivot of {sh.name} by {rc.name}")
    b.set(target, "A1", value=f"{'Total' if agg == 'sum' else 'Count'} by {rc.name}"
          + (f" and {cc.name}" if cc else ""), reason="title")
    hdr = 3
    b.set(target, a1(hdr, 1), value=rc.name, reason="header")
    keys = col_keys or [None]
    for j, k in enumerate(keys, start=2):
        b.set(target, a1(hdr, j), value=(str(k) if k is not None else
                                          (vc.name if vc and not signed else "Amount")),
              reason="header")
    total_col = len(keys) + 2
    if cc:
        b.set(target, a1(hdr, total_col), value="Total", reason="header")

    def measure(row_cell: str, col_cell: str | None) -> str:
        crit = [f"{rr},{row_cell}"]
        if cc and col_cell:
            crit.append(f"{col_range(sh, table, cc)},{col_cell}")
        if agg == "count":
            return f"=COUNTIFS({','.join(crit)})"
        if signed:
            parts = []
            if cr:
                parts.append(f"SUMIFS({col_range(sh, table, cr)},{','.join(crit)})")
            if dr:
                parts.append(f"-SUMIFS({col_range(sh, table, dr)},{','.join(crit)})")
            return "=" + "".join(parts)
        return f"=SUMIFS({col_range(sh, table, vc)},{','.join(crit)})"

    first = hdr + 1
    for i, key in enumerate(row_keys):
        r = first + i
        b.set(target, a1(r, 1), value=key, reason="row label")
        for j, ck in enumerate(keys, start=2):
            col_cell = f"{a1(hdr, j).rstrip('0123456789')}${hdr}" if ck is not None else None
            b.set(target, a1(r, j), formula=measure(f"$A{r}", col_cell),
                  reason=f"{agg} of {sh.name} where {rc.name} = {key}",
                  number_format=NAIRA_FMT if agg == "sum" else None)
        if cc:
            b.set(target, a1(r, total_col),
                  formula=f"=SUM({a1(r, 2)}:{a1(r, total_col - 1)})", reason="row total",
                  number_format=NAIRA_FMT if agg == "sum" else None)
    last = first + len(row_keys) - 1
    tr = last + 1
    b.set(target, a1(tr, 1), value="Total", reason="grand total")
    for j in range(2, (total_col if cc else 2) + 1):
        col = a1(first, j).rstrip("0123456789")
        b.set(target, a1(tr, j), formula=f"=SUM({col}{first}:{col}{last})", reason="column total",
              number_format=NAIRA_FMT if agg == "sum" else None)
    batch = finish_batch(ctx, b, f"Pivot {sh.name} by {rc.name}",
                         f"{target} · {len(row_keys)} rows × {len(keys)} columns")
    grand = qualify(target, a1(tr, 2 if not cc else total_col))
    gp = next((o.preview_value for o in batch.ops if o.cell == a1(tr, 2 if not cc else total_col)
               and o.sheet == target), None)
    return ToolOutput(
        data={"sheet": target, "rows": len(row_keys), "columns": len(keys),
              "grand_total": gp, "grand_total_cell": grand,
              "table": [[str(k), next((o.preview_value for o in batch.ops
                                       if o.sheet == target and o.cell == a1(first + i, 2)),
                                      None)] for i, k in enumerate(row_keys[:50])]},
        batch=batch, citations=[grand], summary=f"Pivot proposed on {target}.",
    )


# --- add_formula_column ------------------------------------------------------------------
FORMULA_KINDS = ("difference", "sum", "ratio", "percent_of_total", "running_total",
                 "vat_from_gross", "wht", "flag_over", "custom")


def add_formula_column(ctx: ToolContext, *, kind: str, header: str, sheet: str | None = None,
                       workbook_id: str | None = None, columns: list[str] | None = None,
                       threshold: float | None = None, wht_category: str = "consultancy",
                       payee_type: str = "corporate", template: str | None = None) -> ToolOutput:
    """Typed formula columns (the pipeline writes the formula, not the model).
    ``custom`` takes a template like ``=E{row}-D{row}`` that is validated against
    the function whitelist and the table's own columns."""
    if kind not in FORMULA_KINDS:
        raise ToolError(f"kind must be one of {FORMULA_KINDS}")
    wb, sh, table = ctx.find_sheet(sheet, workbook_id)
    cols = [table.col(c) for c in (columns or [])]
    if any(c is None for c in cols):
        raise ToolError(f"unknown column in {columns} (have: {[c.name for c in table.columns]})")
    if not cols and kind not in ("custom",):
        amt = table.col("amount") or table.col("debit") or table.col("credit")
        cols = [amt] if amt else []
    need = {"difference": 2, "ratio": 2, "sum": 1, "percent_of_total": 1, "running_total": 1,
            "vat_from_gross": 1, "wht": 1, "flag_over": 1}.get(kind, 0)
    if len(cols) < need:
        raise ToolError(f"{kind} needs {need} column(s)")
    cfg = load_tax_config()
    target = _target_column(sh, table, header)
    L = [c.letter for c in cols]  # noqa: N806
    first, last = table.first_row, table.last_row
    tl = a1(table.header_row, target).rstrip("0123456789")

    def formula(r: int) -> str:
        if kind == "difference":
            return f"={L[0]}{r}-{L[1]}{r}"
        if kind == "sum":
            return "=" + "+".join(f"{x}{r}" for x in L)
        if kind == "ratio":
            return f"=IF({L[1]}{r}=0,0,{L[0]}{r}/{L[1]}{r})"
        if kind == "percent_of_total":
            return f"=IF(SUM(${L[0]}${first}:${L[0]}${last})=0,0,{L[0]}{r}/SUM(${L[0]}${first}:${L[0]}${last}))"
        if kind == "running_total":
            return f"={L[0]}{r}" if r == first else f"={tl}{r - 1}+{L[0]}{r}"
        if kind == "vat_from_gross":
            rate = cfg["vat"]["standardRatePct"] / 100
            return f"=ROUND({L[0]}{r}*{rate}/(1+{rate}),2)"
        if kind == "wht":
            rates = cfg["wht"]["rates"].get(wht_category)
            if rates is None:
                raise ToolError(f"unknown WHT category {wht_category!r}")
            pct = rates["corporatePct" if payee_type == "corporate" else "individualPct"] / 100
            return f"=ROUND({L[0]}{r}*{pct},2)"
        if kind == "flag_over":
            if threshold is None:
                raise ToolError("flag_over needs a threshold")
            return f'=IF(ABS({L[0]}{r})>{threshold},"Check","")'
        if not template:
            raise ToolError("custom needs a template such as =E{row}-D{row}")
        f = template if template.startswith("=") else "=" + template
        return f.replace("{row}", str(r))

    if kind == "custom":
        sample = formula(first)
        try:
            check_formula(sample)
        except FormulaError as exc:
            raise ToolError(f"template rejected: {exc}") from exc
        if "!" in sample:
            raise ToolError("custom templates may only reference this sheet")
    b = OpBuilder(wb, "add_formula_column")
    b.set(sh.name, a1(table.header_row, target), value=header, reason=f"{kind} column header")
    pct = kind in ("ratio", "percent_of_total")
    for r in range(first, last + 1):
        if all(sh.value(r, c.index) is None for c in table.columns):
            continue
        b.set(sh.name, a1(r, target), formula=formula(r),
              reason=f"add_formula_column {{{kind}}}",
              source_rows=[qualify(sh.name, f"{x}{r}") for x in L],
              number_format="0.0%" if pct else (None if kind == "flag_over" else NAIRA_FMT))
    batch = finish_batch(ctx, b, f"Add {header} column on {sh.name}",
                         f"{qualify(sh.name, tl)} · {len(b.ops) - 1} formulas")
    return ToolOutput(
        data={"sheet": sh.name, "column": tl, "kind": kind, "rows": len(b.ops) - 1,
              "sample_formula": formula(first)},
        batch=batch, summary=f"Proposed a {kind} column '{header}' in {sh.name}!{tl}.",
    )


# --- create_sheet / create_workbook --------------------------------------------------------
def create_sheet(ctx: ToolContext, *, name: str, workbook_id: str | None = None,
                 headers: list[str] | None = None, rows: list[list[Any]] | None = None,
                 title: str | None = None) -> ToolOutput:
    wb = ctx.workbook(workbook_id)
    return _layout(ctx, wb, name, headers, rows, title, "create_sheet")


def create_workbook(ctx: ToolContext, *, name: str, sheets: list[dict[str, Any]] | None = None
                    ) -> ToolOutput:
    wb = ctx.add_new_workbook(name)
    specs = sheets or [{"name": "Sheet1"}]
    batches = []
    out_sheets = []
    for spec in specs:
        out = _layout(ctx, wb, spec.get("name") or "Sheet1", spec.get("headers"),
                      spec.get("rows"), spec.get("title"), "create_workbook")
        batches.append(out.batch)
        out_sheets.append(out.data["sheet"])
    merged = batches[0]
    for extra in batches[1:]:
        merged.ops.extend(extra.ops)
    from litchai.workbench.ops import Operation

    merged.ops.insert(0, Operation("create_workbook", wb.id, reason=f"New workbook {name}",
                                   tool="create_workbook", kind="new", new_value=name))
    merged.title = f"Create workbook {name}"
    return ToolOutput(data={"workbook_id": wb.id, "name": name, "sheets": out_sheets},
                      batch=merged, summary=f"Proposed a new workbook {name}.")


def _layout(ctx: ToolContext, wb: Workbook, name: str, headers: list[str] | None,
            rows: list[list[Any]] | None, title: str | None, tool: str) -> ToolOutput:
    b = OpBuilder(wb, tool)
    target = b.create_sheet(name, f"New sheet {name}")
    r = 1
    if title:
        b.set(target, "A1", value=title, reason="title")
        r = 3
    for j, h in enumerate(headers or [], start=1):
        b.set(target, a1(r, j), value=h, reason="header")
    for i, row in enumerate(rows or [], start=1):
        for j, v in enumerate(row, start=1):
            if v is None or v == "":
                continue
            if isinstance(v, str) and v.startswith("="):
                try:
                    check_formula(v)
                except FormulaError as exc:
                    raise ToolError(f"formula rejected in row {i}: {exc}") from exc
                b.set(target, a1(r + i, j), formula=v, reason="layout formula")
            else:
                b.set(target, a1(r + i, j), value=v, reason="layout value")
    batch = finish_batch(ctx, b, f"Create sheet {target}", f"{target} in {wb.name}")
    return ToolOutput(data={"sheet": target, "workbook_id": wb.id}, batch=batch,
                      summary=f"Proposed new sheet {target}.")

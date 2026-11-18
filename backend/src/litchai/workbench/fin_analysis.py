"""Trial balance look-up and the financial-analysis sheet (plan v4, slice 2).

``tb_lines`` (read) lists each TB account with its IFRS line and the exact debit
and credit cells, so a formula can point at "Trade receivables" without guessing
an address. ``financial_analysis`` (write) proposes one sheet of live formulas over
the TB cells: profitability, liquidity, assets and solvency, returns and
efficiency, and PASS / FAIL validation checks. Ratios point at the figure rows on
the same sheet, so a change in the TB flows through every line.
"""
from __future__ import annotations

import re
from typing import Any

from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.model import a1, qualify
from litchai.workbench.ops import OpBuilder
from litchai.workbench.trial_balance import (
    LINES,
    TOLERANCE,
    TbAccount,
    TrialBalance,
    _sum_formula,
    detect_trial_balance,
    map_account,
)

ACC_DEP = re.compile(r"accumulated depreciation|acc\.? dep|provision for depreciation|"
                     r"accumulated amorti", re.IGNORECASE)
MONEY = '"₦"#,##0.00'
PCT = "0.0%"
TIMES = '0.00"x"'
DAYS = '0" days"'
HEAD = {"b": True, "bg": "E8EEF7"}
TOTAL = {"b": True, "bt": True}


def _tb(ctx: ToolContext, sheet: str | None, workbook_id: str | None) -> TrialBalance:
    tb = detect_trial_balance(ctx, sheet, workbook_id)
    if tb is None:
        raise ToolError("no trial balance found: a TB needs an account name column and Debit "
                        "and Credit columns (or an account code with one signed balance column)")
    for a in tb.accounts:
        a.line, a.mapped_by = map_account(a)
    return tb


def tb_lines(ctx: ToolContext, *, sheet: str | None = None, workbook_id: str | None = None,
             line: str | None = None, name_contains: str | None = None) -> ToolOutput:
    tb = _tb(ctx, sheet, workbook_id)
    s = tb.sheet.name
    rows = []
    for a in tb.accounts:
        if line and a.line != line:
            continue
        if name_contains and name_contains.lower() not in a.name.lower():
            continue
        row = {"code": a.code, "name": a.name, "line": a.line, "row": a.row,
               "debit": a.debit, "credit": a.credit}
        if tb.debit_col:  # cells as A1 on the TB sheet (named once in "sheet")
            row["dr"], row["cr"] = a1(a.row, tb.debit_col), a1(a.row, tb.credit_col)
        else:
            row["bal"] = a1(a.row, tb.balance_col)
        rows.append(row)
    lines = sorted({a.line for a in tb.accounts if a.line})
    data = {"sheet": s, "workbook_id": tb.workbook.id, "accounts": rows[:80],
            "total_accounts": len(rows), "lines": lines,
            "unmapped": [a.name for a in tb.accounts if a.line is None]}
    return ToolOutput(data=data, citations=[qualify(s, a1(r["row"], tb.name_col)) for r in rows][:20],
                      summary=f"{len(rows)} TB account(s) on {s}"
                              + (f" for {line}" if line else "") + ".")


def financial_analysis(ctx: ToolContext, *, sheet: str | None = None,
                       workbook_id: str | None = None, new_sheet_name: str | None = None,
                       period_label: str | None = None) -> ToolOutput:
    from litchai.taxconfig import load_tax_config

    tb = _tb(ctx, sheet, workbook_id)
    src = tb.sheet.name
    by_line: dict[str, list[TbAccount]] = {}
    for a in tb.accounts:
        if a.line:
            by_line.setdefault(a.line, []).append(a)
    unmapped = [a for a in tb.accounts if a.line is None]

    def acc(*lines: str) -> str:
        """Sum of the TB cells of these lines, in each line's own sign."""
        parts = [_sum_formula(tb, by_line.get(ln, []), LINES[ln][0])[1:] for ln in lines
                 if by_line.get(ln)]
        return "=" + "+".join(f"({p})" for p in parts) if parts else "=0"

    nca = by_line.get("non_current_assets", [])
    dep = [a for a in nca if ACC_DEP.search(a.name)]
    cost = [a for a in nca if a not in dep]
    has_tax_line = bool(by_line.get("income_tax"))

    b = OpBuilder(tb.workbook, "financial_analysis")
    name = b.create_sheet(new_sheet_name or "Financial Analysis",
                          "Financial analysis: live formulas over the trial balance")
    reason = f"financial_analysis · from {src}"
    period = period_label or ctx.period_label or "Year"
    keys: dict[str, str] = {}
    r = 1

    def put(cell: str, **kw: Any) -> None:
        b.set(name, cell, reason=reason, **kw)

    put("A1", value=ctx.client_name or "Financial analysis", style={"b": True})
    put("A2", value=f"Financial analysis · {period}")
    put("A3", value=f"Source: {src}. Every figure is a formula over the trial balance cells.")
    r = 4

    def head(title: str) -> None:
        nonlocal r
        r += 1
        put(f"A{r}", value=title, style=HEAD)
        put(f"B{r}", value="Value", style=HEAD)
        put(f"C{r}", value="How", style=HEAD)
        r += 1

    def row(label: str, key: str | None, formula: str, fmt: str = MONEY, how: str = "",
            total: bool = False) -> None:
        nonlocal r
        f = formula
        for k, ref in keys.items():
            f = f.replace("{" + k + "}", ref)
        if "{" in f:
            raise ToolError(f"internal: unresolved key in {label}: {f}")
        put(f"A{r}", value=label, style=TOTAL if total else None)
        put(f"B{r}", formula=f, number_format=fmt, style=TOTAL if total else None)
        if how:
            put(f"C{r}", value=how)
        if key:
            keys[key] = f"B{r}"
        r += 1

    def ratio(num: str, den: str) -> str:
        return f"=IFERROR({num}/{den},0)"

    # Profitability ----------------------------------------------------------------
    head("Profitability Analysis")
    row("Revenue", "rev", acc("revenue"), how="TB revenue accounts (credit − debit)")
    row("Cost of sales", "cos", acc("cost_of_sales"), how="TB cost of sales accounts")
    row("Gross profit", "gp", "={rev}-{cos}", total=True, how="Revenue − cost of sales")
    row("Gross margin", "gm", ratio("{gp}", "{rev}"), PCT, "Gross profit ÷ revenue")
    row("Other income", "oi", acc("other_income"))
    row("Operating expenses", "opex", acc("distribution_costs", "administrative_expenses"),
        how="Distribution + administrative (no cost of sales, no interest)")
    row("Operating profit", "op", "={gp}+{oi}-{opex}", total=True,
        how="Gross profit + other income − operating expenses")
    row("Operating margin", "om", ratio("{op}", "{rev}"), PCT, "Operating profit ÷ revenue")
    row("Finance income", "fi", acc("finance_income"))
    row("Finance costs (interest)", "fc", acc("finance_costs"))
    row("Profit before tax", "pbt", "={op}+{fi}-{fc}", total=True,
        how="Operating profit + finance income − finance costs")
    tax_note = ""
    if has_tax_line:
        row("Income tax expense", "tax", acc("income_tax"), how="TB income tax accounts")
    else:
        cfg = load_tax_config()
        c = cfg["cit"]
        rate = float(c["standardRatePct"])
        levy = float(c["developmentLevy"]["ratePct"])
        row("Estimated CIT and development levy", "tax",
            f"=MAX(0,{{pbt}})*{rate + levy}/100",
            how=f"Not in the TB: PBT × {rate:g}% CIT + {levy:g}% levy (tax config "
                f"{cfg['version']}); before add-backs and capital allowances")
        tax_note = (f"Tax is an estimate at {rate + levy:g}% of PBT (no tax account in the "
                    "TB). Run tax_compute kind=cit for the full computation.")
    row("Profit after tax" if has_tax_line else "Profit after estimated tax", "pat",
        "={pbt}-{tax}", total=True)
    row("Net margin", "nm", ratio("{pat}", "{rev}"), PCT, "Profit after tax ÷ revenue")

    # Liquidity --------------------------------------------------------------------
    head("Liquidity Analysis")
    row("Inventories", "inv", acc("inventories"))
    row("Trade and other receivables", "rec", acc("trade_receivables"))
    row("Cash and cash equivalents", "cash", acc("cash"))
    row("Current assets", "ca", "={inv}+{rec}+{cash}", total=True)
    row("Trade and other payables", "pay", acc("trade_payables"))
    row("Tax payables", "taxp", acc("tax_payables"))
    row("Current liabilities", "cl", "={pay}+{taxp}", total=True,
        how="Payables + VAT, WHT and other tax payables in the TB")
    row("Working capital", "wc", "={ca}-{cl}", total=True, how="Current assets − current liabilities")
    row("Current ratio", "cr", ratio("{ca}", "{cl}"), TIMES, "Current assets ÷ current liabilities")
    row("Quick ratio", "qr", ratio("({ca}-{inv})", "{cl}"), TIMES,
        "(Current assets − inventories) ÷ current liabilities")
    row("Cash ratio", "cashr", ratio("{cash}", "{cl}"), TIMES, "Cash ÷ current liabilities")

    # Assets and solvency ----------------------------------------------------------
    head("Asset Analysis")
    row("Property, plant and equipment (cost)", "ppe", _sum_formula(tb, cost, "debit"))
    row("Accumulated depreciation", "dep", _sum_formula(tb, dep, "credit"))
    row("Net book value", "nbv", "={ppe}-{dep}", total=True, how="Cost − accumulated depreciation")
    row("Total assets", "ta", "={nbv}+{ca}", total=True)
    row("Borrowings", "debt", acc("borrowings"))
    row("Total liabilities", "tl", "={cl}+{debt}", total=True)
    # The estimated tax is not booked in the TB, so equity takes the profit before
    # tax (as the TB statements do) and the balance check still holds.
    row("Equity (capital, reserves and the year's profit)", "eq",
        acc("share_capital", "retained_earnings", "other_reserves")
        + ("+{pat}" if has_tax_line else "+{pbt}"), total=True,
        how="" if has_tax_line else "Profit before tax: the tax estimate is not booked")
    row("Debt to equity", "de", ratio("{debt}", "{eq}"), TIMES, "Borrowings ÷ equity")
    row("Gearing", None, ratio("{debt}", "({debt}+{eq})"), PCT, "Borrowings ÷ (borrowings + equity)")
    row("Interest cover", "ic", ratio("{op}", "{fc}"), TIMES, "Operating profit ÷ finance costs")

    # Returns and efficiency -------------------------------------------------------
    head("Returns and efficiency")
    row("Return on assets", None, ratio("{pat}", "{ta}"), PCT, "Profit after tax ÷ total assets")
    row("Return on equity", None, ratio("{pat}", "{eq}"), PCT, "Profit after tax ÷ equity")
    row("Asset turnover", None, ratio("{rev}", "{ta}"), TIMES, "Revenue ÷ total assets")
    row("Receivable days", None, ratio("{rec}*365", "{rev}"), DAYS, "Receivables ÷ revenue × 365")
    row("Payable days", None, ratio("{pay}*365", "{cos}"), DAYS, "Payables ÷ cost of sales × 365")
    row("Inventory days", None, ratio("{inv}*365", "{cos}"), DAYS, "Inventories ÷ cost of sales × 365")

    # Validation -------------------------------------------------------------------
    head("Validation Checks")
    first, last = tb.accounts[0].row, tb.accounts[-1].row
    if tb.debit_col:
        dcol = qualify(src, f"{a1(first, tb.debit_col)}:{a1(last, tb.debit_col)}")
        ccol = qualify(src, f"{a1(first, tb.credit_col)}:{a1(last, tb.credit_col)}")
        row("Total debits (TB)", "tdr", f"=SUM({dcol})")
        row("Total credits (TB)", "tcr", f"=SUM({ccol})")
    else:
        bcol = qualify(src, f"{a1(first, tb.balance_col)}:{a1(last, tb.balance_col)}")
        row("Net of all balances (TB)", "tdr", f"=SUM({bcol})")
        keys["tcr"] = "0"
    row("Debits equal credits", "chk_tb", f'=IF(ABS({{tdr}}-{{tcr}})<={TOLERANCE},"PASS","FAIL")',
        "General", "Difference within ₦0.50")
    row("Balance sheet balances", "chk_bs",
        f'=IF(ABS({{ta}}-({{tl}}+{{eq}}))<={TOLERANCE},"PASS","FAIL")', "General",
        "Total assets = liabilities + equity")
    row("Working capital is positive", "chk_wc", '=IF({wc}>0,"PASS","FAIL")', "General")
    row("Current ratio at least 1.0", "chk_cr", '=IF({cr}>=1,"PASS","FAIL")', "General")
    row("Unmapped TB accounts", None, f"={len(unmapped)}", "0",
        ", ".join(a.name for a in unmapped[:8]) or "None: every account has a line")

    # PASS in green, FAIL in red (Excel's Good and Bad styles), live in the file.
    from litchai.workbench.condfmt import FAIL_RULE, PASS_RULE

    checks_from = int(keys["chk_tb"][1:])
    b.cond_format(name, f"B{checks_from}:B{checks_from + 3}", [PASS_RULE, FAIL_RULE],
                  reason=f"{reason} · PASS green, FAIL red")
    batch = finish_batch(ctx, b, "Financial analysis from the trial balance",
                         f"{name} · ratios, liquidity, solvency, checks")
    previews = {op.cell: op.preview_value for op in batch.ops
                if op.op == "set_cell" and op.sheet == name and op.new_formula}
    figures = {k: previews.get(ref) for k, ref in keys.items() if ref.startswith("B")}
    checks = {k: figures.get(k) for k in ("chk_tb", "chk_bs", "chk_wc", "chk_cr")}
    data: dict[str, Any] = {
        "sheet": name, "source": src, "figures": figures, "checks": checks,
        "key_cells": {k: qualify(name, ref) for k, ref in keys.items() if ref.startswith("B")},
        "unmapped": [a.name for a in unmapped], "notes": [tax_note] if tax_note else [],
    }

    def money(k: str) -> str:
        v = figures.get(k)
        return f"{v:,.2f}" if isinstance(v, (int, float)) else "?"

    summary = (f"Financial analysis on {name}: revenue {money('rev')}, gross profit "
               f"{money('gp')}, operating profit {money('op')}, PBT {money('pbt')}, working "
               f"capital {money('wc')}. Checks: "
               + ", ".join(f"{k.removeprefix('chk_')} {v}" for k, v in checks.items()) + "."
               + (f" {tax_note}" if tax_note else ""))
    return ToolOutput(data=data, batch=batch, summary=summary,
                      citations=[qualify(name, keys[k]) for k in ("rev", "gp", "pbt", "wc")
                                 if k in keys])

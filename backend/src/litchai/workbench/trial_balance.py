"""Trial balance → income statement and balance sheet (QA S5–S7).

``detect_trial_balance`` finds a TB in the open workbooks: an account code and/or
name column with Debit and Credit columns, or one signed balance column (debit
positive). Totals rows are skipped. ``trial_balance_statements`` maps every
account to an IFRS line (name keywords first, then the code range), checks that
debits equal credits, computes the income statement and the balance sheet in
Python, and proposes both as new sheets whose lines are formulas over the TB
cells. Unmapped accounts are listed, never guessed. The profit before tax goes
into the turn memory, so ``tax_compute kind=cit`` chains without retyping it.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from litchai.workbench.context import ToolContext, ToolError, ToolOutput, finish_batch
from litchai.workbench.model import Sheet, Workbook, a1, qualify, to_number
from litchai.workbench.ops import OpBuilder
from litchai.workbench.tables import Table, detect_table

TOLERANCE = 0.5

# IFRS line → (kind, statement). kind: "credit" lines are credit − debit (income,
# liabilities, equity); "debit" lines are debit − credit (expenses, assets).
LINES: dict[str, tuple[str, str, str]] = {
    "revenue": ("credit", "pnl", "Revenue"),
    "cost_of_sales": ("debit", "pnl", "Cost of sales"),
    "other_income": ("credit", "pnl", "Other income"),
    "distribution_costs": ("debit", "pnl", "Distribution and selling costs"),
    "administrative_expenses": ("debit", "pnl", "Administrative expenses"),
    "finance_income": ("credit", "pnl", "Finance income"),
    "finance_costs": ("debit", "pnl", "Finance costs"),
    "income_tax": ("debit", "pnl", "Income tax expense"),
    "non_current_assets": ("debit", "bs", ("Property, plant and equipment and other "
                                          "non-current assets")),
    "inventories": ("debit", "bs", "Inventories"),
    "trade_receivables": ("debit", "bs", "Trade and other receivables"),
    "cash": ("debit", "bs", "Cash and cash equivalents"),
    "trade_payables": ("credit", "bs", "Trade and other payables"),
    "tax_payables": ("credit", "bs", "Tax payables (VAT, WHT, PAYE, CIT)"),
    "borrowings": ("credit", "bs", "Borrowings"),
    "share_capital": ("credit", "bs", "Share capital"),
    "retained_earnings": ("credit", "bs", "Retained earnings brought forward"),
    "other_reserves": ("credit", "bs", "Other reserves"),
}

# Name keywords, checked in this order (the first match wins).
KEYWORDS: list[tuple[str, str]] = [
    (r"accumulated depreciation|acc\.? dep|provision for depreciation", "non_current_assets"),
    (r"cost of sales|cost of goods|cost of revenue|direct cost|purchases", "cost_of_sales"),
    (r"interest income|finance income|investment income", "finance_income"),
    (r"interest|finance cost|loan charge|overdraft charge", "finance_costs"),
    (r"income tax expense|tax expense|cit expense|deferred tax expense", "income_tax"),
    ((r"vat payable|wht payable|paye payable|tax payable|cit payable|withholding tax payable|"
     r"output vat|income tax payable"), "tax_payables"),
    (r"loan|borrowing|debenture|overdraft", "borrowings"),
    (r"payable|creditor|accrual|accrued", "trade_payables"),
    (r"share capital|ordinary shares|issued capital|paid.up capital", "share_capital"),
    (r"retained earnings|accumulated profit|profit and loss account|revenue reserve",
     "retained_earnings"),
    (r"reserve|share premium", "other_reserves"),
    (r"revenue|sales|turnover|fees earned|service income", "revenue"),
    (r"other income|sundry income|gain on|dividend income|rental income", "other_income"),
    (r"selling|distribution|marketing|advertis|delivery expense", "distribution_costs"),
    (r"inventor|stock", "inventories"),
    (r"receivable|debtor|prepayment|advance to", "trade_receivables"),
    (r"cash|bank|petty", "cash"),
    ((r"property|plant|equipment|ppe|vehicle|motor|building|land|furniture|fixture|computer"
     r"|intangible|goodwill|investment property|right.of.use"), "non_current_assets"),
    ((r"salar|wage|rent|depreciation|amortis|utilit|insurance|repair|running|fuel|office|"
     r"admin|professional|audit|legal|travel|telephone|internet|bank charge|expense|cost"),
     "administrative_expenses"),
]

# Code ranges of the common Nigerian chart (first digit).
CODE_RANGE = {"1": "assets", "2": "liabilities", "3": "equity", "4": "revenue",
              "5": "cost_of_sales", "6": "administrative_expenses", "7": "finance_costs",
              "8": "other_income", "9": "income_tax"}


@dataclass
class TbAccount:
    row: int
    code: str
    name: str
    debit: float
    credit: float
    line: str | None = None
    mapped_by: str = ""

    @property
    def net_debit(self) -> float:
        return self.debit - self.credit


@dataclass
class TrialBalance:
    workbook: Workbook
    sheet: Sheet
    table: Table
    code_col: int | None
    name_col: int
    debit_col: int | None
    credit_col: int | None
    balance_col: int | None
    accounts: list[TbAccount] = field(default_factory=list)
    totals_row: int | None = None


def _find(table: Table, words: tuple[str, ...], exclude: tuple[str, ...] = ()) -> int | None:
    for c in table.columns:
        n = c.name.strip().lower()
        if any(re.search(rf"\b{w}\b", n) for w in words) and not any(x in n for x in exclude):
            return c.index
    return None


def _tb_of(wb: Workbook, sheet: Sheet) -> TrialBalance | None:
    t = detect_table(sheet)
    if t is None or not t.columns:
        return None
    debit = _find(t, ("debit", "dr"))
    credit = _find(t, ("credit", "cr"))
    balance = None if (debit and credit) else _find(t, ("balance", "net", "amount"))
    code = _find(t, ("code", "a/c no", "account no", "gl code", "ledger code", "no"),
                 exclude=("name",))
    name = _find(t, ("account name", "name", "account", "description", "details"),
                 exclude=("code", "no"))
    if name is None or not ((debit and credit) or (balance and code)):
        return None
    tb = TrialBalance(wb, sheet, t, code, name, debit if credit else None,
                      credit if debit else None, balance)
    for r in range(t.first_row, t.last_row + 1):
        label = str(sheet.value(r, name) or "").strip()
        code_v = str(sheet.value(r, code) or "").strip() if code else ""
        code_v = code_v.removesuffix(".0")
        if not label and not code_v:
            continue
        if re.match(r"^(grand )?totals?\b", label.lower()) and not code_v:
            tb.totals_row = r
            continue
        if tb.debit_col:
            d = to_number(sheet.value(r, tb.debit_col)) or 0.0
            c = to_number(sheet.value(r, tb.credit_col)) or 0.0
        else:
            b = to_number(sheet.value(r, balance)) or 0.0
            d, c = (b, 0.0) if b >= 0 else (0.0, -b)
        if d == 0 and c == 0 and not label:
            continue
        tb.accounts.append(TbAccount(r, code_v, label, d, c))
    return tb if len(tb.accounts) >= 3 else None


def detect_trial_balance(ctx: ToolContext, sheet: str | None = None,
                         workbook_id: str | None = None) -> TrialBalance | None:
    books = [ctx.workbook(workbook_id)] if workbook_id else list(ctx.workbooks.values())
    for wb in books:
        for name, sh in wb.sheets.items():
            if sheet and name.lower() != sheet.lower():
                continue
            tb = _tb_of(wb, sh)
            if tb is not None:
                return tb
    return None


def looks_like_tb(workbooks: dict[str, Workbook]) -> bool:
    """Cheap check for the decision layer: any sheet that reads as a trial balance."""
    for wb in workbooks.values():
        for sh in wb.sheets.values():
            if sh.formula_count() * 2 > len(sh.cells):
                continue  # a computed schedule, not source data
            if _tb_of(wb, sh) is not None:
                return True
    return False


def map_account(acc: TbAccount) -> tuple[str | None, str]:
    """Name keywords first. When the code range names a statement (1-3 balance
    sheet, 4-9 income statement), only lines of that statement may match, so
    "Vehicle running costs" coded 6xxx is an expense, not a vehicle asset."""
    name = acc.name.lower()
    group = CODE_RANGE.get(acc.code[:1]) if acc.code[:1].isdigit() else None
    want = None if group is None else (
        "bs" if group in ("assets", "liabilities", "equity") else "pnl")
    for pattern, line in KEYWORDS:
        if want and LINES[line][1] != want:
            continue
        if re.search(pattern, name):
            return line, f"name ({pattern.split('|')[0]})"
    by_code = {"revenue": "revenue", "cost_of_sales": "cost_of_sales",
               "administrative_expenses": "administrative_expenses",
               "finance_costs": "finance_costs", "other_income": "other_income",
               "income_tax": "income_tax", "liabilities": "trade_payables",
               "equity": "other_reserves"}
    if group in by_code:
        return by_code[group], "code range"
    if group == "assets":
        return ("non_current_assets" if acc.net_debit >= 0 else None), "code range"
    return None, ""


def _sum_formula(tb: TrialBalance, accs: list[TbAccount], kind: str) -> str:
    """=(Debits)-(Credits) (or the reverse) over the TB cells of these accounts."""
    s = tb.sheet.name
    if not accs:
        return "=0"
    if tb.debit_col:
        d = "+".join(qualify(s, a1(a.row, tb.debit_col)) for a in accs)
        c = "+".join(qualify(s, a1(a.row, tb.credit_col)) for a in accs)
        return f"=({c})-({d})" if kind == "credit" else f"=({d})-({c})"
    b = "+".join(qualify(s, a1(a.row, tb.balance_col)) for a in accs)
    return f"=-({b})" if kind == "credit" else f"=({b})"


def trial_balance_statements(ctx: ToolContext, *, sheet: str | None = None,
                             workbook_id: str | None = None, write: bool = True,
                             period_label: str | None = None) -> ToolOutput:
    from litchai.workbench.compiler_tools import basis

    tb = detect_trial_balance(ctx, sheet, workbook_id)
    if tb is None:
        raise ToolError("no trial balance found: a TB needs an account name column and Debit "
                        "and Credit columns (or an account code with one signed balance column)")
    unmapped = []
    for a in tb.accounts:
        a.line, a.mapped_by = map_account(a)
        if a.line is None:
            unmapped.append(a)
    total_dr = round(sum(a.debit for a in tb.accounts), 2)
    total_cr = round(sum(a.credit for a in tb.accounts), 2)
    diff = round(total_dr - total_cr, 2)
    balanced = abs(diff) <= TOLERANCE

    def line_total(line: str) -> float:
        kind = LINES[line][0]
        v = sum((a.credit - a.debit) if kind == "credit" else (a.debit - a.credit)
                for a in tb.accounts if a.line == line)
        return round(v, 2)

    t = {k: line_total(k) for k in LINES}
    gp = round(t["revenue"] - t["cost_of_sales"], 2)
    op = round(gp + t["other_income"] - t["distribution_costs"] - t["administrative_expenses"], 2)
    pbt = round(op + t["finance_income"] - t["finance_costs"], 2)
    pat = round(pbt - t["income_tax"], 2)
    nca = t["non_current_assets"]
    ca = round(t["inventories"] + t["trade_receivables"] + t["cash"], 2)
    total_assets = round(nca + ca, 2)
    cl = round(t["trade_payables"] + t["tax_payables"], 2)
    ncl = t["borrowings"]
    equity = round(t["share_capital"] + t["retained_earnings"] + t["other_reserves"] + pat, 2)
    eq_liab = round(equity + cl + ncl, 2)
    pnl = {"revenue": t["revenue"], "cost_of_sales": t["cost_of_sales"], "gross_profit": gp,
           "other_income": t["other_income"], "distribution_costs": t["distribution_costs"],
           "administrative_expenses": t["administrative_expenses"], "operating_profit": op,
           "finance_income": t["finance_income"], "finance_costs": t["finance_costs"],
           "profit_before_tax": pbt, "income_tax": t["income_tax"], "profit_after_tax": pat}
    bs = {"non_current_assets": nca, "inventories": t["inventories"],
          "trade_receivables": t["trade_receivables"], "cash": t["cash"],
          "current_assets": ca, "total_assets": total_assets,
          "trade_payables": t["trade_payables"], "tax_payables": t["tax_payables"],
          "current_liabilities": cl, "borrowings": ncl, "share_capital": t["share_capital"],
          "retained_earnings_bf": t["retained_earnings"], "other_reserves": t["other_reserves"],
          "profit_for_the_year": pat, "total_equity": equity,
          "total_equity_and_liabilities": eq_liab,
          "balance_check": round(total_assets - eq_liab, 2)}
    src = tb.sheet.name
    data: dict[str, Any] = {
        "sheet": src, "accounts": len(tb.accounts), "total_debits": total_dr,
        "total_credits": total_cr, "difference": diff, "balanced": balanced,
        "income_statement": pnl, "balance_sheet": bs,
        "unmapped": [{"code": a.code, "name": a.name, "debit": a.debit, "credit": a.credit,
                      "cell": qualify(src, a1(a.row, tb.name_col))} for a in unmapped],
        "mapping": [{"code": a.code, "name": a.name, "line": a.line, "by": a.mapped_by}
                    for a in tb.accounts][:40],
        "basis": basis(
            "Each account maps to an IFRS (IAS 1) line by its name, then by its code range "
            "(1 assets, 2 liabilities, 3 equity, 4 revenue, 5 cost of sales, 6 admin, 7 finance "
            "costs). Gross profit = revenue − cost of sales; PBT = gross profit + other income − "
            "distribution − admin + finance income − finance costs. The balance sheet adds the "
            "year's profit to equity. Debits must equal credits.",
            compiler="tb-statements-1.0", source="IAS 1 presentation, from the trial balance",
            inputs={"sheet": src, "accounts": len(tb.accounts)},
            assumptions=["No tax adjustments: PBT is before CIT."]
            + ([f"{len(unmapped)} account(s) are not mapped and are left out: "
                + ", ".join(a.name for a in unmapped[:6])] if unmapped else [])),
    }
    tdr = qualify(src, a1(tb.totals_row, tb.debit_col)) if tb.totals_row and tb.debit_col else None
    cites = [qualify(src, a1(tb.table.first_row, tb.name_col))] + ([tdr] if tdr else [])
    # Chained figures for tax_compute kind=cit (profit and turnover from the TB).
    ctx.memory["pnl"] = {"figures": {"net_profit": pbt, "total_revenue": t["revenue"],
                                     "total_fixed_assets": nca},
                         "key_cells": {}}
    summary = (f"Trial balance {'balances' if balanced else 'does NOT balance'}: debits "
               f"{total_dr:,.2f}, credits {total_cr:,.2f}"
               + ("" if balanced else f" (difference {diff:,.2f})") + f". Revenue "
               f"{t['revenue']:,.2f}, cost of sales {t['cost_of_sales']:,.2f}, gross profit "
               f"{gp:,.2f}, administrative expenses {t['administrative_expenses']:,.2f}, finance "
               f"costs {t['finance_costs']:,.2f}, profit before tax {pbt:,.2f}. Total assets "
               f"{total_assets:,.2f}; equity and liabilities {eq_liab:,.2f}."
               + (f" {len(unmapped)} account(s) not mapped." if unmapped else ""))
    if not write:
        return ToolOutput(data=data, summary=summary, citations=cites)

    b = OpBuilder(tb.workbook, "trial_balance_statements")
    reason = "trial_balance_statements · IAS 1 lines from the TB"
    period = period_label or ctx.period_label or "Year"
    keys: dict[str, str] = {}

    def block(sheet_name: str, title: str, rows: list[tuple[str, str | None, Any]]) -> None:
        b.set(sheet_name, "A1", value=ctx.client_name, reason=reason)
        b.set(sheet_name, "A2", value=f"{title} · {period}", reason=reason)
        r = 4
        for label, key, how in rows:
            b.set(sheet_name, f"A{r}", value=label, reason=reason)
            if isinstance(how, str):
                b.set(sheet_name, f"B{r}", formula=how, reason=reason, number_format='"₦"#,##0.00')
            if key:
                keys[key] = qualify(sheet_name, f"B{r}")
            r += 1

    def acc(line: str) -> str:
        return _sum_formula(tb, [a for a in tb.accounts if a.line == line], LINES[line][0])

    pl = b.create_sheet("Income statement", "Income statement from the trial balance")
    rows_pl: list[tuple[str, str | None, Any]] = [
        ("Revenue", "revenue", acc("revenue")),
        ("Cost of sales", "cost_of_sales", acc("cost_of_sales")),
        ("Gross profit", "gross_profit", "=B4-B5"),
        ("Other income", "other_income", acc("other_income")),
        ("Distribution and selling costs", "distribution_costs", acc("distribution_costs")),
        ("Administrative expenses", "administrative_expenses", acc("administrative_expenses")),
        ("Operating profit", "operating_profit", "=B6+B7-B8-B9"),
        ("Finance income", "finance_income", acc("finance_income")),
        ("Finance costs", "finance_costs", acc("finance_costs")),
        ("Profit before tax", "profit_before_tax", "=B10+B11-B12"),
        ("Income tax expense", "income_tax", acc("income_tax")),
        ("Profit for the year", "profit_after_tax", "=B13-B14"),
    ]
    block(pl, "Income statement", rows_pl)
    pat_ref = keys["profit_after_tax"]
    bsn = b.create_sheet("Balance sheet", "Statement of financial position from the TB")
    rows_bs: list[tuple[str, str | None, Any]] = [
        ("Non-current assets", "non_current_assets", acc("non_current_assets")),
        ("Inventories", "inventories", acc("inventories")),
        ("Trade and other receivables", "trade_receivables", acc("trade_receivables")),
        ("Cash and cash equivalents", "cash", acc("cash")),
        ("Total current assets", "current_assets", "=B5+B6+B7"),
        ("Total assets", "total_assets", "=B4+B8"),
        ("Trade and other payables", "trade_payables", acc("trade_payables")),
        ("Tax payables", "tax_payables", acc("tax_payables")),
        ("Total current liabilities", "current_liabilities", "=B10+B11"),
        ("Borrowings (non-current)", "borrowings", acc("borrowings")),
        ("Share capital", "share_capital", acc("share_capital")),
        ("Retained earnings brought forward", "retained_earnings_bf", acc("retained_earnings")),
        ("Other reserves", "other_reserves", acc("other_reserves")),
        ("Profit for the year", "profit_for_the_year", f"={pat_ref}"),
        ("Total equity", "total_equity", "=B14+B15+B16+B17"),
        ("Total equity and liabilities", "total_equity_and_liabilities", "=B12+B13+B18"),
        ("Balance check (should be 0)", "balance_check", "=B9-B19"),
    ]
    block(bsn, "Statement of financial position", rows_bs)
    batch = finish_batch(ctx, b, "Income statement and balance sheet from the TB",
                         f"{pl}, {bsn} · PBT {pbt:,.2f}")
    data["key_cells"] = keys
    ctx.memory["pnl"]["key_cells"] = {"net_profit": keys["profit_before_tax"]}
    return ToolOutput(data=data, batch=batch, summary=summary,
                      citations=(cites + [keys["profit_before_tax"], keys["gross_profit"]])[:20])

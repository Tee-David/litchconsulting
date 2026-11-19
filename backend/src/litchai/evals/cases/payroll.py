"""Case 4: payroll for 60 staff, Oct-Dec 2025 (fictional data).

Kanko Logistics Ltd runs payroll in a spreadsheet. Planted, as payroll audits find:

P1  PAYE is still worked out on the old rules (consolidated relief, old bands), not
    the NTA 2025 bands in the firm's tax config;
P2  three staff who joined on 1 October have no pension deducted;
P3  a ghost employee: a name not in the staff master, paid into another employee's
    bank account;
P4  a leaver (exit 31 August) is still paid October to December;
P5  one employee was paid twice in November;
P6  December's payroll was never posted to the books (salaries in the TB are short).
"""
from __future__ import annotations

import io
import random
from datetime import date, datetime

from openpyxl import Workbook

from litchai.evals.cases import Case, Problem

MONTHS = ("2025-10", "2025-11", "2025-12")
FIRST = ("Ada", "Bola", "Chidi", "Dayo", "Efe", "Femi", "Gbenga", "Halima", "Ife", "Jide",
         "Kemi", "Lola", "Musa", "Ngozi", "Ola", "Pelumi", "Rasheed", "Sade", "Tunde", "Uche")
LAST = ("Adeyemi", "Bello", "Chukwu", "Danjuma", "Eze", "Fashola", "Garba", "Hassan", "Ibe",
        "Johnson", "Kalu", "Lawal", "Mohammed", "Nwosu", "Okafor", "Popoola")


def _r2(x: float) -> float:
    return round(x + 1e-9, 2)


def old_paye_annual(gross: float, pension: float) -> float:
    """The pre-2026 rule many payrolls still use: CRA = 200,000 + 20% of gross; bands
    7/11/15/19/21/24 (this is the error planted in P1)."""
    cra = max(200_000, 0.01 * gross) + 0.2 * gross
    taxable = max(0.0, gross - pension - cra)
    tax, left = 0.0, taxable
    for width, rate in ((300_000, .07), (300_000, .11), (500_000, .15), (500_000, .19),
                        (1_600_000, .21), (None, .24)):
        part = left if width is None else min(left, width)
        tax += part * rate
        left -= part
        if left <= 0:
            break
    return _r2(tax)


def build(seed: int = 2025) -> Case:
    from litchai.taxconfig import load_tax_config
    from litchai.workbench.analysis import paye_annual

    cfg = load_tax_config()
    pen_rate = cfg["payroll"]["pension"]["employeePct"] / 100
    rnd = random.Random(seed)
    staff = []
    for i in range(1, 61):
        gross = float(rnd.choice([180_000, 250_000, 320_000, 450_000, 600_000, 850_000, 1_200_000,
                                  1_800_000]))
        staff.append({"id": f"S{i:03d}", "name": f"{rnd.choice(FIRST)} {rnd.choice(LAST)}",
                      "bank": rnd.choice(["GTBank", "Access", "Zenith", "UBA", "First Bank"]),
                      "account": f"{rnd.randint(10**9, 10**10 - 1)}",
                      "joined": date(rnd.randint(2018, 2024), rnd.randint(1, 12), 1),
                      "exit": None, "gross": gross})
    for s in staff[57:]:
        s["joined"] = date(2025, 10, 1)  # P2: new joiners, no pension set up
    leaver = staff[26]
    leaver["exit"] = date(2025, 8, 31)  # P4
    ghost = {"id": "S061", "name": "Emeka Obi", "bank": staff[13]["bank"],
             "account": staff[13]["account"], "gross": 450_000.0}  # P3
    dup_staff = staff[32]  # P5

    lines = []
    for m in MONTHS:
        for s in staff:
            pension = 0.0 if s["joined"] == date(2025, 10, 1) else _r2(s["gross"] * pen_rate)
            paye = _r2(old_paye_annual(s["gross"] * 12, pension * 12) / 12)  # P1
            lines.append([m, s["id"], s["name"], s["bank"], s["account"], s["gross"], pension,
                          paye, _r2(s["gross"] - pension - paye)])
        g = ghost
        gp = _r2(g["gross"] * pen_rate)
        gt = _r2(old_paye_annual(g["gross"] * 12, gp * 12) / 12)
        lines.append([m, g["id"], g["name"], g["bank"], g["account"], g["gross"], gp, gt,
                      _r2(g["gross"] - gp - gt)])
    dup = next(x for x in lines if x[0] == "2025-11" and x[1] == dup_staff["id"])
    lines.append(list(dup))

    # --- truth --------------------------------------------------------------------
    def paye_ok(gross_m: float, pension_m: float) -> float:
        tax, _ = paye_annual(cfg, max(0.0, gross_m * 12 - pension_m * 12))
        return _r2(tax / 12)

    paye_gap = 0.0
    for s in staff:
        pension = _r2(s["gross"] * pen_rate)
        for _ in MONTHS:
            used = paye_ok(s["gross"], pension) if s["joined"] != date(2025, 10, 1) else None
            deducted = _r2(old_paye_annual(s["gross"] * 12, (0 if s["joined"] == date(2025, 10, 1)
                                                              else pension) * 12) / 12)
            if used is not None:
                paye_gap += used - deducted
    pension_missing = _r2(sum(s["gross"] * pen_rate * 3 for s in staff[57:]))
    ghost_paid = _r2(ghost["gross"] * 3)
    leaver_paid = _r2(leaver["gross"] * 3)
    dup_paid = _r2(dup_staff["gross"])
    gross_total = _r2(sum(x[5] for x in lines))
    dec_gross = _r2(sum(x[5] for x in lines if x[0] == "2025-12"))
    gl_salaries = _r2(gross_total - dec_gross)  # P6

    def xlsx(sheets: dict[str, list[list]]) -> bytes:
        wb = Workbook()
        wb.properties.created = wb.properties.modified = datetime(2026, 1, 5, 9, 0)
        wb.remove(wb.active)
        for name, data in sheets.items():
            ws = wb.create_sheet(name)
            for row in data:
                ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    tb = [("1300", "Bank", 182_400_000.0, 0.0), ("2110", "PAYE payable", 0.0, 6_150_000.0),
          ("2120", "Pension payable", 0.0, 4_920_000.0), ("3000", "Share capital", 0.0, 25_000_000.0),
          ("4000", "Revenue", 0.0, 412_000_000.0), ("5100", "Salaries and wages", gl_salaries, 0.0),
          ("6000", "Operating costs", 141_300_000.0, 0.0)]
    dr, cr = sum(x[2] for x in tb), sum(x[3] for x in tb)
    tb.append(("3100", "Retained earnings", 0.0, _r2(dr - cr)) if dr > cr else
              ("3100", "Retained earnings", _r2(cr - dr), 0.0))
    files = {
        "Payroll_Register_Q4_2025.xlsx": xlsx({"Payroll": [
            ["Month", "Staff ID", "Name", "Bank", "Account number", "Gross pay", "Pension (employee)",
             "PAYE deducted", "Net pay"], *lines]}),
        "Staff_Master_File.xlsx": xlsx({"Staff": [
            ["Staff ID", "Name", "Bank", "Account number", "Date joined", "Exit date",
             "Monthly gross"],
            *[[s["id"], s["name"], s["bank"], s["account"], s["joined"], s["exit"], s["gross"]]
              for s in staff]]}),
        "Kanko_Books_31Dec2025.xlsx": xlsx({"Trial balance": [
            ["Account code", "Account name", "Debit", "Credit"], *[list(x) for x in tb]]}),
    }
    problems = [
        Problem("P1", "PAYE worked out on the old rules, not the NTA 2025 bands",
                [r"paye", r"old|nta|2025|band|under.?deduct|over.?deduct|recalculat|wrong"],
                abs(_r2(paye_gap)), "Payroll register: PAYE deducted"),
        Problem("P2", "No pension for the three staff who joined in October",
                [r"pension", r"missing|not deduct|no pension|zero|new"], pension_missing,
                "Payroll: S058-S060, pension 0"),
        Problem("P3", "Ghost employee S061 Emeka Obi paid into S014's account",
                [r"emeka obi|s061|ghost", r"not in .*master|same (bank )?account|ghost|share"],
                ghost_paid, "Payroll S061 vs staff master"),
        Problem("P4", "Leaver paid after the exit date (31 Aug)",
                [leaver["name"].split()[0].lower() + "|" + leaver["id"].lower() + "|leaver|exit",
                 r"exit|left|after|leaver"], leaver_paid, f"Payroll {leaver['id']}"),
        Problem("P5", "One employee paid twice in November",
                [r"twice|duplicate|double", r"nov|2025-11|" + dup_staff["id"].lower()], dup_paid,
                f"Payroll {dup_staff['id']} 2025-11"),
        Problem("P6", "December payroll not posted to the books",
                [r"dec|2025-12|not posted|missing", r"salar|payroll|general ledger|\bgl\b|books|trial balance"],
                dec_gross, "TB 5100 vs payroll register"),
    ]
    return Case(
        slug="payroll", client="Kanko Logistics Ltd", period="Q4 2025 (Oct-Dec)", files=files,
        prompts=[
            ("Our payroll officer runs salaries in a spreadsheet. Here is the Q4 payroll register, "
             "the staff master file and the trial balance. The MD wants a payroll audit before "
             "the year-end: please check everything and tell me what is wrong, with amounts."),
            "Is our PAYE right under the new tax rules? How much did we under- or over-deduct?",
            "What should salaries in the books be for Q4, and what entries do we need?",
        ],
        problems=problems,
        figures={"paye_gap": _r2(paye_gap), "pension_missing": pension_missing,
                 "ghost_paid": ghost_paid, "leaver_paid": leaver_paid, "duplicate_paid": dup_paid,
                 "december_gross": dec_gross, "payroll_gross": gross_total,
                 "gl_salaries": gl_salaries},
    )

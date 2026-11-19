"""Case 3: an NGO with two donor grants, FY2025 (fictional data).

Bright Futures Health Initiative (a Nigerian NGO) runs a USD health grant (Grant A,
Global Health Fund) and a naira education grant (Grant B, Lagos Education Trust).
Planted, as they happen in NGO books:

P1  Grant A (USD 250,000) was booked fully as income on receipt; only what was spent
    in 2025 is income, the rest is deferred;
P2  the USD receipt was translated at an old rate (780), not the rate on the day;
P3  school-kit purchases for Grant B were charged to Grant A;
P4  items the donor does not allow (staff party drinks, a gift) were charged to Grant A;
P5  Grant B's second tranche is for 2026 activities but was booked as 2025 income;
P6  USD account bank charges were not booked;
P7  the programme officer's salary was charged 100% to Grant A; the timesheets say 60%.
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime

from openpyxl import Workbook

from litchai.evals.cases import Case, Problem

RATE_RECEIPT = 1530.0   # official rate on 15 Jul 2025 (fictional)
RATE_BOOKED = 780.0     # the old rate the bookkeeper used
USD_GRANT = 250_000.0


def _r2(x: float) -> float:
    return round(x + 1e-9, 2)


def build(seed: int = 2025) -> Case:
    del seed
    spend = [  # date, grant, activity, payee, amount (NGN)
        (date(2025, 7, 20), "GA", "Malaria test kits", "MedSupply Nigeria Ltd", 41_500_000.0),
        (date(2025, 8, 5), "GA", "Community health worker training", "Hotel Bayview Ikorodu", 18_200_000.0),
        (date(2025, 8, 30), "GA", "Primary school kits - Ikorodu schools", "EduPack Ltd", 9_600_000.0),  # P3
        (date(2025, 9, 14), "GA", "Mosquito nets distribution", "NetLife Ltd", 52_750_000.0),
        (date(2025, 10, 2), "GA", "Staff party - drinks", "Sip & Co", 1_350_000.0),  # P4
        (date(2025, 10, 22), "GA", "Clinic outreach transport", "Lagos Bus Hire", 6_400_000.0),
        (date(2025, 11, 11), "GA", "Gift to commissioner's office", "Gift Hampers NG", 850_000.0),  # P4
        (date(2025, 11, 25), "GB", "Teacher training workshop", "Learnwell Centre", 7_900_000.0),
        (date(2025, 12, 3), "GA", "Primary school kits - Epe schools", "EduPack Ltd", 4_300_000.0),  # P3
        (date(2025, 12, 10), "GB", "Reading books for pupils", "BookHub Ltd", 5_600_000.0),
    ]
    salary = 14_400_000.0   # programme officer, all charged to GA (P7)
    ga_share = 0.60
    gb_first, gb_second = 30_000_000.0, 25_000_000.0  # P5: second tranche is for 2026
    usd_charges = [(date(2025, 7, 31), 45.0), (date(2025, 8, 31), 45.0),
                   (date(2025, 9, 30), 45.0), (date(2025, 10, 31), 45.0),
                   (date(2025, 11, 30), 45.0), (date(2025, 12, 31), 45.0)]  # P6
    rate_dec = 1490.0

    # --- truth --------------------------------------------------------------------
    misallocated = _r2(sum(a for d, g, act, p, a in spend if g == "GA" and "school" in act.lower()))
    ineligible = _r2(sum(a for d, g, act, p, a in spend
                         if g == "GA" and ("drinks" in act.lower() or "gift" in act.lower())))
    salary_over = _r2(salary * (1 - ga_share))
    ga_spent_books = _r2(sum(a for d, g, act, p, a in spend if g == "GA") + salary)
    ga_eligible_spent = _r2(ga_spent_books - misallocated - ineligible - salary_over)
    grant_ngn_true = _r2(USD_GRANT * RATE_RECEIPT)
    grant_ngn_books = _r2(USD_GRANT * RATE_BOOKED)
    fx_understated = _r2(grant_ngn_true - grant_ngn_books)
    deferred_ga = _r2(grant_ngn_true - ga_eligible_spent)
    charges_usd = _r2(sum(x for _, x in usd_charges))
    charges_ngn = _r2(sum(x * rate_dec for _, x in usd_charges))

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

    bank = io.StringIO()
    w = csv.writer(bank)
    w.writerow(["Date", "Narration", "Debit (USD)", "Credit (USD)", "Balance (USD)"])
    bal = 0.0
    lines = [(date(2025, 7, 15), "GLOBAL HEALTH FUND GRANT GA-2025-07", 0.0, USD_GRANT)]
    lines += [(d, "ACCOUNT MAINTENANCE CHARGE", x, 0.0) for d, x in usd_charges]
    lines += [(date(2025, 7, 18), "TRF TO NAIRA ACCOUNT", 120_000.0, 0.0),
              (date(2025, 9, 9), "TRF TO NAIRA ACCOUNT", 60_000.0, 0.0)]
    for d, n, dr, cr in sorted(lines):
        bal = _r2(bal + cr - dr)
        w.writerow([d.strftime("%d/%m/%Y"), n, f"{dr:.2f}" if dr else "", f"{cr:.2f}" if cr else "",
                    f"{bal:.2f}"])
    fx = io.StringIO()
    w = csv.writer(fx)
    w.writerow(["Date", "Official rate (NGN per USD)"])
    for d, r in [(date(2025, 1, 2), 780.0), (date(2025, 7, 15), RATE_RECEIPT),
                 (date(2025, 9, 9), 1512.0), (date(2025, 12, 31), rate_dec)]:
        w.writerow([d.strftime("%d/%m/%Y"), f"{r:.2f}"])
    agreement = (
        "GLOBAL HEALTH FUND - GRANT AGREEMENT GA-2025-07 (extract)\n"
        "Grantee: Bright Futures Health Initiative. Amount: USD 250,000.\n"
        "Purpose: malaria prevention and community health in Ikorodu and Epe, July 2025 to "
        "June 2026.\n"
        "Restricted funds: the grant may only be spent on the approved health activities. "
        "Unspent funds at the end of a financial year are carried forward, not income.\n"
        "Not allowed: alcohol, entertainment, gifts to public officials, and costs of other "
        "projects. Staff costs only in the share of time spent on this grant (timesheets).\n"
        "Reporting: in US dollars, translated at the official rate on the date of receipt.\n"
        "\n"
        "LAGOS EDUCATION TRUST - GRANT GB-2025 (extract)\n"
        "Amount: NGN 55,000,000 in two tranches. Tranche 1 (NGN 30,000,000) for 2025 "
        "activities. Tranche 2 (NGN 25,000,000), paid in December 2025, is for 2026 activities "
        "only.\n"
    )
    other_income = _r2(gb_first + gb_second)
    tb = [("1300", "Naira bank account", 96_400_000.0, 0.0),
          ("1310", "USD bank account (in NGN)", _r2(bal * RATE_BOOKED), 0.0),
          ("2000", "Payables", 0.0, 3_200_000.0),
          ("4000", "Grant income - Global Health Fund (GA)", 0.0, grant_ngn_books),
          ("4010", "Grant income - Lagos Education Trust (GB)", 0.0, other_income),
          ("5000", "Programme costs - GA", ga_spent_books, 0.0),
          ("5010", "Programme costs - GB", _r2(sum(a for d, g, act, p, a in spend if g == "GB")), 0.0),
          ("6000", "Core staff and office costs", 22_800_000.0, 0.0)]
    dr, cr = sum(x[2] for x in tb), sum(x[3] for x in tb)
    tb.append(("3000", "Accumulated fund", 0.0, _r2(dr - cr)) if dr > cr else
              ("3000", "Accumulated fund", _r2(cr - dr), 0.0))
    files = {
        "Grant_Agreements_Extract.txt": agreement.encode("utf-8"),
        "Grant_Spend_Ledger_2025.xlsx": xlsx({"Spend": [
            ["Date", "Grant code", "Activity", "Payee", "Amount (NGN)"],
            *[list(x) for x in spend],
            [date(2025, 12, 31), "GA", "Salary - programme officer (Jul-Dec)", "Payroll", salary]]}),
        "Staff_Timesheets_2025.xlsx": xlsx({"Time split": [
            ["Staff", "Role", "GA %", "GB %", "Core %"],
            ["Aisha Bello", "Programme officer", 60, 25, 15],
            ["Chidi Okafor", "Finance officer", 0, 0, 100]]}),
        "USD_Account_Statement_2025.csv": bank.getvalue().encode("utf-8"),
        "Official_FX_Rates_2025.csv": fx.getvalue().encode("utf-8"),
        "BrightFutures_Books_31Dec2025.xlsx": xlsx({"Trial balance": [
            ["Account code", "Account name", "Debit", "Credit"], *[list(x) for x in tb]]}),
    }
    problems = [
        Problem("P1", "Grant A booked as income on receipt; unspent part should be deferred",
                [r"defer|carr(y|ied) forward|unspent|restricted", r"income|grant a|\bga\b|global health"],
                deferred_ga, "Agreement: restricted; TB 4000"),
        Problem("P2", "USD grant translated at 780 instead of 1,530 on the receipt date",
                [r"780|1,?530|exchange rate|fx rate|official rate"], fx_understated,
                "FX rates 15/07/2025 vs books"),
        Problem("P3", "School kits (education) charged to the health grant",
                [r"school", r"wrong grant|grant b|\bgb\b|education|misallocat|not .*health"],
                misallocated, "Spend ledger: EduPack Ltd lines under GA"),
        Problem("P4", "Ineligible costs (drinks, gift to officials) charged to Grant A",
                [r"drinks|party|gift|alcohol|entertainment", r"not allowed|ineligible|disallow|refund|unrestricted"],
                ineligible, "Spend ledger: Sip & Co, Gift Hampers NG"),
        Problem("P5", "Grant B tranche 2 is for 2026 but booked as 2025 income",
                [r"tranche|25,?000,?000|2026", r"defer|advance|next year|2026|not .*2025"],
                gb_second, "Agreement GB tranche 2; TB 4010"),
        Problem("P6", "USD account charges not booked",
                [r"(bank|maintenance|account) charges?", r"usd|dollar"],
                charges_ngn, "USD statement: maintenance charges"),
        Problem("P7", "Programme officer salary 100% to Grant A; timesheet says 60%",
                [r"salar|programme officer|aisha|staff cost", r"60\s*%|timesheet|over.?charg|40\s*%"],
                salary_over, "Spend ledger salary vs timesheets"),
    ]
    return Case(
        slug="ngo", client="Bright Futures Health Initiative", period="FY2025", files=files,
        prompts=[
            ("We are an NGO with two donor grants. Here are the grant agreements, our spend "
             "ledger, timesheets, the dollar account statement, the official FX rates and our "
             "2025 trial balance. The donors want grant reports soon. Please review our books "
             "against the grant agreements and tell me what is wrong."),
            ("How much of each grant can we show as income for 2025, and how much do we carry "
             "forward?"),
            "Prepare the adjusting entries.",
        ],
        problems=problems,
        figures={"grant_ngn_true": grant_ngn_true, "grant_ngn_books": grant_ngn_books,
                 "fx_understated": fx_understated, "ga_eligible_spent": ga_eligible_spent,
                 "deferred_ga": deferred_ga, "misallocated": misallocated,
                 "ineligible": ineligible, "salary_over": salary_over,
                 "gb_deferred": gb_second, "usd_charges": charges_usd,
                 "usd_charges_ngn": charges_ngn},
    )

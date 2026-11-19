"""Case 1: a supermarket chain with three branches, Q4 2025 (fictional data).

Adaeze FreshMart Ltd sells basic food (VAT exempt under the NTA 2025) and standard-
rated goods (7.5%) in Ikeja, Lekki and Surulere. The bookkeeper posted revenue and
VAT straight from the POS export. Planted, as they happen in real shops:

P1  the Lekki POS batches for 3-9 Nov were uploaded twice;
P2  voided sales (status VOID) were left in the totals;
P3  the POS charged 7.5% VAT on exempt basic food;
P4  Surulere banked less cash than its tills recorded on three days;
P5  card sales were booked at the net settlement: the card fees are missing;
P6  the books were closed on 30 Dec: 31 Dec sales are left out;
P7  the Ikeja POS was down on 24 Dec: cash was banked, no sales were recorded.
"""
from __future__ import annotations

import csv
import io
import random
from datetime import date, datetime, timedelta

from openpyxl import Workbook

from litchai.evals.cases import Case, Problem

BRANCHES = ("Ikeja", "Lekki", "Surulere")
CATS = {"Basic food": False, "Beverages": True, "Household": True, "Toiletries": True}
VAT = 0.075
CARD_FEE = 0.005
CASH_SHARE = 0.4


def _r2(x: float) -> float:
    return round(x + 1e-9, 2)


def _vat_in(gross: float) -> float:
    return _r2(gross * VAT / (1 + VAT))


def build(seed: int = 2025) -> Case:
    rnd = random.Random(seed)
    start, end = date(2025, 10, 1), date(2025, 12, 31)
    days = [start + timedelta(d) for d in range((end - start).days + 1)]
    rows = []  # the POS export, as the system wrote it
    for d in days:
        for b in BRANCHES:
            if b == "Ikeja" and d == date(2025, 12, 24):
                continue  # P7: POS down all day
            for cat in CATS:
                base = {"Basic food": 420_000, "Beverages": 260_000, "Household": 180_000,
                        "Toiletries": 120_000}[cat] * (1.3 if d.month == 12 else 1.0)
                gross = _r2(round(base * rnd.uniform(0.75, 1.25), -2))
                rows.append({"date": d, "branch": b, "batch": f"{b[:3].upper()}-{d:%Y%m%d}",
                             "category": cat, "gross": gross,
                             "vat": _vat_in(gross),  # P3: the POS taxes basic food too
                             "status": "OK"})
    dup_week = (date(2025, 11, 3), date(2025, 11, 9))
    voids = rnd.sample([r for r in rows if r["date"].month in (10, 11) and not (
        r["branch"] == "Lekki" and dup_week[0] <= r["date"] <= dup_week[1])], 9)  # independent of P1
    for v in voids:
        v["status"] = "VOID"  # P2
    dup = [dict(r) for r in rows if r["branch"] == "Lekki"
           and date(2025, 11, 3) <= r["date"] <= date(2025, 11, 9)]  # P1
    export = rows + dup
    rnd.shuffle(export)
    export.sort(key=lambda r: (r["date"], r["branch"]))

    # --- truth --------------------------------------------------------------------
    good = [r for r in rows if r["status"] == "OK"]
    def correct_vat(r: dict) -> float:
        return _vat_in(r["gross"]) if CATS[r["category"]] else 0.0
    unrecorded_gross = 1_250_000.0  # P7: Ikeja cash banked on 24 Dec, no POS
    true_rev = _r2(sum(r["gross"] - correct_vat(r) for r in good)
                   + unrecorded_gross - _vat_in(unrecorded_gross))
    true_vat = _r2(sum(correct_vat(r) for r in good) + _vat_in(unrecorded_gross))

    # --- card and cash ----------------------------------------------------------------
    by_day: dict[tuple[date, str], float] = {}
    for r in good:
        by_day[(r["date"], r["branch"])] = by_day.get((r["date"], r["branch"]), 0) + r["gross"]
    cash_sheet, settlements = [], []
    short_days = {date(2025, 10, 17): 85_000.0, date(2025, 11, 21): 120_000.0,
                  date(2025, 12, 12): 95_000.0}  # P4 Surulere
    for (d, b), g in sorted(by_day.items()):
        cash = _r2(g * CASH_SHARE)
        banked = cash - (short_days.get(d, 0.0) if b == "Surulere" else 0.0)
        cash_sheet.append([d, b, cash, banked, f"{b[:2].upper()}-teller"])
    cash_sheet.append([date(2025, 12, 24), "Ikeja", None, unrecorded_gross, "IK-teller"])
    cash_sheet.sort(key=lambda r: (r[0], r[1]))
    fees_total = 0.0
    week = start
    while week <= end:
        we = min(week + timedelta(6), end)
        for b in BRANCHES:
            card = _r2(sum(g * (1 - CASH_SHARE) for (d, bb), g in by_day.items()
                           if bb == b and week <= d <= we))
            fee = _r2(card * CARD_FEE)
            fees_total += fee
            settlements.append([we, b, card, fee, _r2(card - fee)])
        week = we + timedelta(1)
    fees_total = _r2(fees_total)

    # --- the bookkeeper's books ----------------------------------------------------
    posted = [r for r in export if r["date"] <= date(2025, 12, 30)]  # P6 closed on 30 Dec
    bk_vat = _r2(sum(r["vat"] for r in posted))
    bk_rev = _r2(sum(r["gross"] - r["vat"] for r in posted) - fees_total)  # P5 net of fees
    dec31 = [r for r in good if r["date"] == date(2025, 12, 31)]
    dup_gross = _r2(sum(r["gross"] for r in dup))
    void_gross = _r2(sum(r["gross"] for r in voids))
    food_vat = _r2(sum(r["vat"] for r in good if not CATS[r["category"]]))
    dec31_gross = _r2(sum(r["gross"] for r in dec31))
    short_total = _r2(sum(short_days.values()))

    tb = [("1100", "Inventory", 61_400_000.0, 0.0), ("1300", "Bank - current account", 0.0, 0.0),
          ("1310", "Cash in tills", 2_350_000.0, 0.0), ("2000", "Trade payables", 0.0, 48_900_000.0),
          ("2100", "VAT payable", 0.0, bk_vat), ("3000", "Share capital", 0.0, 20_000_000.0),
          ("4000", "Sales revenue", 0.0, bk_rev), ("5000", "Cost of sales", _r2(bk_rev * 0.71), 0.0),
          ("6000", "Staff costs", 18_600_000.0, 0.0), ("6100", "Rent", 9_000_000.0, 0.0),
          ("6200", "Power and diesel", 7_850_000.0, 0.0)]
    dr = sum(x[2] for x in tb)
    cr = sum(x[3] for x in tb)
    tb[1] = ("1300", "Bank - current account", _r2(cr - dr), 0.0) if cr > dr else (
        "1300", "Bank - current account", 0.0, _r2(dr - cr))

    def xlsx(sheets: dict[str, list[list]]) -> bytes:
        wb = Workbook()
        wb.properties.created = wb.properties.modified = datetime(2026, 1, 5, 9, 0)  # same bytes
        wb.remove(wb.active)
        for name, data in sheets.items():
            ws = wb.create_sheet(name)
            for row in data:
                ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    pos_csv = io.StringIO()
    w = csv.writer(pos_csv)
    w.writerow(["Date", "Branch", "Batch ID", "Category", "Gross sales (incl VAT)",
                "VAT charged", "Status"])
    for r in export:
        w.writerow([r["date"].strftime("%d/%m/%Y"), r["branch"], r["batch"], r["category"],
                    f"{r['gross']:.2f}", f"{r['vat']:.2f}", r["status"]])
    card_csv = io.StringIO()
    w = csv.writer(card_csv)
    w.writerow(["Week ending", "Branch", "Card sales (gross)", "Processor fee", "Net settled"])
    for s in settlements:
        w.writerow([s[0].strftime("%d/%m/%Y"), s[1], f"{s[2]:.2f}", f"{s[3]:.2f}", f"{s[4]:.2f}"])

    files = {
        "FreshMart_POS_Export_Q4_2025.csv": pos_csv.getvalue().encode("utf-8"),
        "Card_Settlement_Report_Q4_2025.csv": card_csv.getvalue().encode("utf-8"),
        "Cash_Banking_Q4_2025.xlsx": xlsx({"Cash banking": [
            ["Date", "Branch", "Cash per till", "Cash banked", "Banked by"], *cash_sheet]}),
        "FreshMart_Books_31Dec2025.xlsx": xlsx({
            "Trial balance": [["Account code", "Account name", "Debit", "Credit"],
                              *[list(x) for x in tb]],
            "Notes": [["Books for Q4 posted from the POS export (gross less VAT charged)."],
                      ["Card sales are posted when the processor pays us."],
                      ["Books closed on 30 December 2025."]]}),
    }
    problems = [
        Problem("P1", "Lekki POS batches for 3-9 Nov uploaded twice",
                [r"duplicat|twice|double", r"lekki"], dup_gross, "POS export, Lekki 03/11-09/11"),
        Problem("P2", "Voided sales left in the totals", [r"\bvoid"], void_gross,
                "POS export, Status = VOID (9 lines)"),
        Problem("P3", "VAT charged on exempt basic food",
                [r"basic food", r"exempt|zero.?rated|should not|no vat|not (be )?charged"], food_vat,
                "POS export, Category = Basic food"),
        Problem("P4", "Surulere cash banked short on three days",
                [r"surulere", r"short|less than|not banked|missing|differen|unbanked"], short_total,
                "Cash banking: 17 Oct, 21 Nov, 12 Dec"),
        Problem("P5", "Card processor fees missing (card sales booked net)",
                [r"fee|commission|charge", r"card|settle|processor"], fees_total,
                "Card settlement report, Processor fee"),
        Problem("P6", "31 December sales left out (books closed on 30 Dec)",
                [r"31(st)?\s*(dec|/12)|12-31|cut.?off|30(th)?\s*(dec|/12)|12-30"], dec31_gross,
                "POS export, 31/12/2025"),
        Problem("P7", "Ikeja sales on 24 Dec not recorded (POS down, cash banked)",
                [r"ikeja", r"24(th)?\s*(dec|/12)|12-24|unrecorded|not recorded|no (pos|sales)"],
                unrecorded_gross, "Cash banking 24/12 Ikeja, no POS lines"),
    ]
    return Case(
        slug="supermarket", client="Adaeze FreshMart Ltd", period="Q4 2025 (Oct-Dec)",
        files=files,
        prompts=[
            ("Hi, these are our Q4 files for the three shops: the POS export, the card "
             "settlement report, the cash banking sheet and our books. Our accountant says the "
             "sales figure looks wrong. Please go through everything and tell me what is wrong "
             "and by how much."),
            "What should our output VAT for the quarter be? Show me how you got it.",
            "Please prepare the correcting entries so the books show the right sales.",
        ],
        problems=problems,
        figures={"true_revenue": true_rev, "true_output_vat": true_vat, "books_revenue": bk_rev,
                 "books_vat": bk_vat, "duplicates_gross": dup_gross, "voids_gross": void_gross,
                 "vat_on_basic_food": food_vat, "cash_short": short_total,
                 "card_fees": fees_total, "dec31_gross": dec31_gross,
                 "unrecorded_gross": unrecorded_gross},
    )

"""Case 2: a building contractor, FY2025 (fictional data).

Ogun Bridgeworks Ltd builds for state agencies and private clients. Revenue is billed
on certificates; clients keep 5% retention and deduct WHT. Planted, as they happen:

P1  a mobilisation advance (no work done) was booked as revenue;
P2  retention held by clients was never recorded (invoices posted at the net amount);
P3  one client deducted WHT at 10% (the consultancy rate) on construction work (5%);
P4  materials still on site at 31 Dec were expensed;
P5  one contract was billed ahead of the engineer's certificate (over-billing);
P6  WHT deducted by one client has no credit note, so it cannot be set off yet;
P7  VAT was not charged on one private client's invoices;
P8  one invoice was posted twice.
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime

from openpyxl import Workbook

from litchai.evals.cases import Case, Problem

VAT = 0.075
RETENTION = 0.05
WHT_OK = 0.05


def _r2(x: float) -> float:
    return round(x + 1e-9, 2)


def build(seed: int = 2025) -> Case:
    del seed  # fixed data: every figure is chosen, so the key is easy to read
    contracts = [
        # id, client, value (excl VAT), certified % at 31 Dec, billed %, vat_registered_client
        ("C-101", "Lagos State Roads Agency", 480_000_000.0, 0.70, 0.70, True),
        ("C-102", "Ikeja Mall Developers Ltd", 260_000_000.0, 0.60, 0.80, True),   # P5
        ("C-103", "Abeokuta Water Board", 150_000_000.0, 1.00, 1.00, True),
        ("C-104", "Ogun Housing Corporation", 320_000_000.0, 0.00, 0.00, True),    # P1 advance
        ("C-105", "Mr Tunde Bakare (private villa)", 95_000_000.0, 0.50, 0.50, False),  # P7
    ]
    wht_rate = {"Abeokuta Water Board": 0.10}   # P3: consultancy rate used
    no_credit_note = {"Ikeja Mall Developers Ltd"}  # P6
    invoices, receipts = [], []
    n = 4100
    for cid, client, value, cert, billed, vat_ok in contracts:
        if billed == 0:
            continue
        stages = 2 if billed < 1 else 3
        for k in range(stages):
            n += 1
            amount = _r2(value * billed / stages)
            vat = _r2(amount * VAT) if vat_ok else 0.0   # P7: no VAT for the villa
            d = date(2025, 3 + 3 * k, 28)
            invoices.append({"no": f"OBW-{n}", "contract": cid, "client": client, "date": d,
                             "type": "Progress certificate", "amount": amount, "vat": vat})
            ret = _r2(amount * RETENTION)
            wht = _r2(amount * wht_rate.get(client, WHT_OK))
            receipts.append({"date": date(2025, 4 + 3 * k, 15), "client": client,
                             "invoice": f"OBW-{n}", "gross": _r2(amount + vat),
                             "retention": ret, "wht": wht,
                             "net": _r2(amount + vat - ret - wht)})
    advance = 64_000_000.0  # P1: 20% mobilisation on C-104, received 10 Sep
    invoices.append({"no": "OBW-4199", "contract": "C-104", "client": "Ogun Housing Corporation",
                     "date": date(2025, 9, 1), "type": "Mobilisation advance",
                     "amount": advance, "vat": _r2(advance * VAT)})
    receipts.append({"date": date(2025, 9, 10), "client": "Ogun Housing Corporation",
                     "invoice": "OBW-4199", "gross": _r2(advance * 1.075), "retention": 0.0,
                     "wht": _r2(advance * WHT_OK), "net": _r2(advance * 1.075 - advance * WHT_OK)})
    dup = dict(invoices[0])  # P8: OBW-4101 posted twice

    # --- truth --------------------------------------------------------------------
    retention_total = _r2(sum(r["retention"] for r in receipts))
    over_wht = _r2(sum(r["wht"] - r["gross"] / 1.075 * WHT_OK for r in receipts
                       if r["client"] in wht_rate))
    no_cn_wht = _r2(sum(r["wht"] for r in receipts if r["client"] in no_credit_note))
    c102 = next(c for c in contracts if c[0] == "C-102")
    over_billed = _r2(c102[2] * (c102[4] - c102[3]))
    villa_vat = _r2(sum(i["amount"] * VAT for i in invoices if i["client"].startswith("Mr ")))
    materials_on_site = 18_450_000.0  # P4
    bk_revenue = _r2(sum(i["amount"] for i in invoices) + dup["amount"]
                     - retention_total)  # advance in revenue, dup in, retention netted off
    true_revenue = _r2(sum(i["amount"] for i in invoices if i["type"] != "Mobilisation advance")
                       - over_billed)

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

    inv_rows = [[i["no"], i["date"], i["contract"], i["client"], i["type"], i["amount"], i["vat"],
                 _r2(i["amount"] + i["vat"])] for i in invoices]
    inv_rows.insert(1, [dup["no"], dup["date"], dup["contract"], dup["client"], dup["type"],
                        dup["amount"], dup["vat"], _r2(dup["amount"] + dup["vat"])])
    rc = io.StringIO()
    w = csv.writer(rc)
    w.writerow(["Date received", "Client", "Invoice no", "Invoice total", "Retention held",
                "WHT deducted", "Net received"])
    for r in receipts:
        w.writerow([r["date"].strftime("%d/%m/%Y"), r["client"], r["invoice"], f"{r['gross']:.2f}",
                    f"{r['retention']:.2f}", f"{r['wht']:.2f}", f"{r['net']:.2f}"])
    cn_rows = [[r["client"], r["invoice"], r["wht"], "Received"] for r in receipts
               if r["client"] not in no_credit_note]
    receivable = _r2(sum(i["amount"] + i["vat"] for i in invoices) + dup["amount"] + dup["vat"]
                     - sum(r["gross"] for r in receipts))
    tb = [("1000", "Plant and equipment", 210_000_000.0, 0.0),
          ("1010", "Accumulated depreciation", 0.0, 64_000_000.0),
          ("1200", "Trade receivables", receivable, 0.0),
          ("1210", "WHT receivable", _r2(sum(r["wht"] for r in receipts)), 0.0),
          ("1300", "Bank", 96_500_000.0, 0.0),
          ("2000", "Trade payables", 0.0, 71_300_000.0),
          ("2100", "VAT payable", 0.0, _r2(sum(i["vat"] for i in invoices) + dup["vat"])),
          ("3000", "Share capital", 0.0, 50_000_000.0),
          ("4000", "Contract revenue", 0.0, bk_revenue),
          ("5000", "Cost of contracts (materials, labour, subcontract)", _r2(bk_revenue * 0.68), 0.0),
          ("6000", "Administrative expenses", 58_200_000.0, 0.0)]
    dr, cr = sum(x[2] for x in tb), sum(x[3] for x in tb)
    tb.append(("3100", "Retained earnings", 0.0, _r2(dr - cr)) if dr > cr else
              ("3100", "Retained earnings", _r2(cr - dr), 0.0))
    files = {
        "Contracts_Register_2025.xlsx": xlsx({"Contracts": [
            ["Contract", "Client", "Contract value (excl VAT)", "Certified complete at 31 Dec",
             "Retention %", "Notes"],
            *[[c[0], c[1], c[2], c[3], RETENTION,
               "Mobilisation 20% received; site handed over Jan 2026" if c[0] == "C-104" else ""]
              for c in contracts]],
            "Materials on site": [["Site", "Item", "Value at cost", "Counted on"],
                                  ["C-101 Ikorodu", "Reinforcement steel", 11_200_000.0, "31/12/2025"],
                                  ["C-102 Ikeja", "Cement and blocks", 7_250_000.0, "31/12/2025"]]}),
        "Sales_Invoices_2025.xlsx": xlsx({"Invoices": [
            ["Invoice no", "Date", "Contract", "Client", "Type", "Amount (excl VAT)", "VAT",
             "Total"], *inv_rows]}),
        "Customer_Receipts_2025.csv": rc.getvalue().encode("utf-8"),
        "WHT_Credit_Notes_2025.xlsx": xlsx({"Credit notes": [
            ["Client", "Invoice no", "WHT amount", "Status"], *cn_rows]}),
        "Bridgeworks_Books_31Dec2025.xlsx": xlsx({"Trial balance": [
            ["Account code", "Account name", "Debit", "Credit"], *[list(x) for x in tb]]}),
    }
    problems = [
        Problem("P1", "Mobilisation advance on C-104 booked as revenue",
                [r"advance|mobili[sz]ation", r"c-?104|ogun housing|liabilit|defer|not (yet )?(earned|revenue)"],
                advance, "Invoices OBW-4199; Contracts C-104 (0% certified)"),
        Problem("P2", "Retention held by clients not recorded",
                [r"retention", r"receivable|asset|not recorded|missing|record"], retention_total,
                "Receipts: Retention held"),
        Problem("P3", "Abeokuta Water Board deducted WHT at 10% instead of 5%",
                [r"abeokuta|water board", r"10\s*%|ten per|over.?deduct|excess|wrong rate|5\s*%"],
                over_wht, "Receipts: Abeokuta Water Board"),
        Problem("P4", "Materials on site at 31 Dec expensed",
                [r"material", r"on site|inventory|stock|asset"], materials_on_site,
                "Contracts register, Materials on site"),
        Problem("P5", "C-102 billed 80% but certified 60% (over-billing)",
                [r"c-?102|ikeja mall", r"over.?bill|ahead|60\s*%|certif"], over_billed,
                "Invoices C-102 vs Contracts certified %"),
        Problem("P6", "WHT from Ikeja Mall Developers has no credit note",
                [r"credit note", r"ikeja mall"], no_cn_wht,
                "WHT credit notes: none for Ikeja Mall Developers"),
        Problem("P7", "No VAT charged on the private villa invoices (C-105)",
                [r"vat", r"c-?105|villa|bakare|private"], villa_vat, "Invoices C-105: VAT 0"),
        Problem("P8", "Invoice OBW-4101 posted twice",
                [r"obw-?4101|duplicat|twice"], invoices[0]["amount"], "Invoices: OBW-4101 twice"),
    ]
    return Case(
        slug="contractor", client="Ogun Bridgeworks Ltd", period="FY2025", files=files,
        prompts=[
            ("We are a building contractor. Here are our contracts, invoices, customer receipts, "
             "WHT credit notes and the trial balance for 2025. Our auditor comes next month and "
             "says our revenue and receivables don't make sense. Please review everything and "
             "tell me what needs fixing, with amounts."),
            "How much WHT credit can we actually use against our 2025 tax, and why?",
            "Prepare the adjusting journals and show me the corrected revenue.",
        ],
        problems=problems,
        figures={"true_revenue": true_revenue, "books_revenue": bk_revenue,
                 "retention": retention_total, "over_wht": over_wht,
                 "wht_without_credit_note": no_cn_wht, "over_billed": over_billed,
                 "villa_vat": villa_vat, "materials_on_site": materials_on_site,
                 "advance": advance},
    )

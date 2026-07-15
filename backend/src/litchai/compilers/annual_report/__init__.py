"""Annual-report workbook compiler — IAS 1 and IFRS 18 presentation variants
over one shared skeleton (Cover, P&L, SOFP, SOCF, Bank Recon, Schedules
[, MPM note]), modelled on the firm's two template workbooks.

Data lands only in schedule/detail rows; every statement-face number is a
cross-sheet formula, and the built-in check cells (SOFP balance, bank-rec
difference, SOCF-vs-SOFP cash, receivables ageing) must recompute to zero
before the file can pass the gate (PRD §3 / FR6).
"""
from __future__ import annotations

from itertools import count

from openpyxl import Workbook

from litchai.compilers._common import SUBTLE, CompiledTemplate
from litchai.compilers.annual_report._rows import fix_workbook_properties, write_text
from litchai.compilers.annual_report.bank_recon import build_bank_recon
from litchai.compilers.annual_report.cover import build_cover
from litchai.compilers.annual_report.mpm import build_mpm
from litchai.compilers.annual_report.pnl_ias1 import build_pnl_ias1
from litchai.compilers.annual_report.pnl_ifrs18 import build_pnl_ifrs18
from litchai.compilers.annual_report.schedules import build_schedules
from litchai.compilers.annual_report.socf import build_socf
from litchai.compilers.annual_report.sofp import build_sofp
from litchai.contracts.annual_report import AnnualReportContract
from litchai.taxconfig import load_tax_config

COMPILER_VERSION = "annual-report-1.0.0"
CONTRACT_SCHEMA_VERSION = "annual-report-contract-1"

SHEETS_IAS1 = ("Instructions", "P&L", "SOFP", "SOCF", "Bank Recon", "Schedules")
SHEETS_IFRS18 = (
    "Cover Page",
    "P&L (IFRS 18)",
    "SOFP",
    "SOCF (IFRS 18)",
    "Bank Recon",
    "Schedules",
    "MPM Disclosure Note",
)


def compile_annual_report(contract: AnnualReportContract) -> CompiledTemplate:
    cfg = load_tax_config()
    ias1 = contract.standard == "ias1"
    sheet_names = SHEETS_IAS1 if ias1 else SHEETS_IFRS18

    # Tabs are created in the template's display order, then populated in
    # dependency order (formulas are strings, so populate order is free).
    wb = Workbook()
    wb.active.title = sheet_names[0]
    for name in sheet_names[1:]:
        wb.create_sheet(name)
    fix_workbook_properties(wb)

    key_cells: dict[str, str] = {}

    sched_refs = build_schedules(wb["Schedules"], contract, key_cells)
    recon_refs = build_bank_recon(wb["Bank Recon"], contract, key_cells)

    if ias1:
        pnl_refs = build_pnl_ias1(wb["P&L"], contract, key_cells, sched_refs, count(1))
    else:
        pnl_refs = build_pnl_ifrs18(
            wb["P&L (IFRS 18)"], contract, key_cells, sched_refs, count(1)
        )

    # The firm's templates number SOFP notes 13-37 in BOTH variants (the
    # shared sheets are cell-identical) even though the IFRS 18 P&L runs to
    # 16 — SOFP gets its own counter so cross-variant parity holds.
    build_sofp(wb["SOFP"], contract, key_cells, sched_refs, recon_refs.feed, count(13))

    socf = contract.socf
    common_head = [
        ("Depreciation of property, plant and equipment", socf.dep_ppe),
        ("Amortisation of intangible assets", socf.amort_intangibles),
        ("Depreciation of right-of-use assets", socf.dep_right_of_use),
    ]
    if ias1:
        socf_ws = wb["SOCF"]
        subtitle = "Statement of Cash Flows (Indirect Method)"
        starting_label = "Profit before tax"
        recon_rows = common_head + [
            ("Finance costs", socf.finance_costs_addback),
            ("Finance income", socf.finance_income_addback),
            ("Loss/(gain) on disposal of assets", socf.disposal_gain_loss),
            ("Impairment losses/(reversals)", socf.impairments),
            ("Share of profit of associates", socf.share_of_associates_addback),
        ]
    else:
        socf_ws = wb["SOCF (IFRS 18)"]
        subtitle = "Statement of Cash Flows (Indirect Method) — amended IAS 7 under IFRS 18"
        starting_label = "Operating profit or loss (IFRS 18 starting point)"
        recon_rows = common_head + [
            ("Loss/(gain) on disposal of assets (operating)", socf.disposal_gain_loss),
            ("Impairment losses/(reversals) on receivables", socf.impairments),
        ]

    build_socf(
        socf_ws,
        contract,
        key_cells,
        subtitle=subtitle,
        starting_label=starting_label,
        starting_ref=pnl_refs.socf_start,
        starting_ref_py=pnl_refs.socf_start_py,
        recon_rows=[(label, pair.current, pair.prior) for label, pair in recon_rows],
        sofp_cash_ref=key_cells["sofp:cash"],
    )

    if not ias1:
        build_mpm(wb["MPM Disclosure Note"], contract, key_cells)

    cover_ws = wb[sheet_names[0]]
    build_cover(cover_ws, contract)
    write_text(
        cover_ws,
        "C30",
        f"LitchAI · compiler {COMPILER_VERSION} · contract schema {CONTRACT_SCHEMA_VERSION} · "
        f"tax config {cfg['version']} · all computed cells are formulas",
        font=SUBTLE,
    )

    return CompiledTemplate(workbook=wb, key_cells=key_cells, compiler_version=COMPILER_VERSION)

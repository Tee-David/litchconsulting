"""Supporting-schedules sheet (Schedules 1–8, mirroring the firm's template).

This sheet is where contract data lands; every statement face links here by
cross-sheet formula. The builder returns qualified refs (SchedulesRefs) that
the P&L and SOFP builders consume, so the linkage is defined in exactly one
place.
"""
from __future__ import annotations

from dataclasses import dataclass

from openpyxl.worksheet.worksheet import Worksheet

from litchai.compilers._common import BOLD, THOUSANDS_FMT, col_letter, sheet_ref
from litchai.compilers.annual_report._rows import (
    CUR_COL,
    LABEL_COL,
    SheetWriter,
    write_text,
)
from litchai.contracts.annual_report import ScheduleLine, SupportingSchedules

SHEET = "Schedules"
_FIRST_CLASS_COL = 3  # PPE grid asset-class columns start at C


@dataclass(frozen=True)
class SchedulesRefs:
    """Sheet-qualified refs consumed by the statement builders."""

    revenue_total: str
    revenue_total_py: str
    cos_total: str
    cos_total_py: str
    distribution_total: str
    distribution_total_py: str
    admin_total: str
    admin_total_py: str
    ppe_nbv_total: str
    inventories_total: str
    inventories_total_py: str
    receivables_total: str
    receivables_total_py: str
    payables_total: str
    payables_total_py: str


def _simple_schedule(
    w: SheetWriter, title: str, lines: list[ScheduleLine], total_label: str, key: str
) -> None:
    w.section(title)
    first = w.row
    for line in lines:
        w.input_row(line.label, line.current, line.prior)
    cur, pri = w.sum_rows(first, w.row - 1)
    total_row = w.formula_row(total_label, cur, pri, bold=True, border="top")
    w.key(key, total_row)
    w.blank()


def _ppe_grid(w: SheetWriter, ws: Worksheet, schedules: SupportingSchedules) -> None:
    classes = schedules.ppe_classes
    cols = [col_letter(_FIRST_CLASS_COL + i) for i in range(len(classes))]

    w.section("Schedule 5: Property, plant and equipment — movement schedule (current year)")
    for col, cls in zip(cols, classes):
        write_text(ws, f"{col}{w.row}", cls.label, font=BOLD)
    w.row += 1

    def grid_row(label: str, values: list[float | str]) -> int:
        write_text(ws, f"{LABEL_COL}{w.row}", label)
        for col, value in zip(cols, values):
            cell = ws[f"{col}{w.row}"]
            cell.value = value
            cell.number_format = THOUSANDS_FMT
        w.row += 1
        return w.row - 1

    cost_open = grid_row("Cost/valuation — opening balance", [c.cost_opening for c in classes])
    grid_row("Additions", [c.additions for c in classes])
    cost_disp = grid_row("Disposals", [c.disposals for c in classes])
    cost_close = grid_row(
        "Cost/valuation — closing balance",
        [f"={col}{cost_open}+SUM({col}{cost_open + 1}:{col}{cost_disp})" for col in cols],
    )
    dep_open = grid_row(
        "Accumulated depreciation — opening balance", [c.dep_opening for c in classes]
    )
    grid_row("Charge for the year", [c.dep_charge for c in classes])
    dep_disp = grid_row("Disposals (accum. dep.)", [c.dep_disposals for c in classes])
    dep_close = grid_row(
        "Accumulated depreciation — closing balance",
        [f"={col}{dep_open}+SUM({col}{dep_open + 1}:{col}{dep_disp})" for col in cols],
    )
    nbv = grid_row(
        "Net book value — current year",
        [f"={col}{cost_close}-{col}{dep_close}" for col in cols],
    )
    total_row = w.formula_row(
        "TOTAL net book value (links to SOFP)",
        f"=SUM({cols[0]}{nbv}:{cols[-1]}{nbv})",
        bold=True,
        border="top",
    )
    w.key("schedules:ppe_nbv_total", total_row, prior=False)
    w.blank()


def _ageing_block(
    w: SheetWriter,
    ws: Worksheet,
    title: str,
    ageing,
    *,
    check_against_row: int | None = None,
    check_key: str | None = None,
) -> None:
    w.note_text(title)
    header_cols = ["B", "C", "D", "E"]
    labels = ["Not yet due", "1-30 days past due", "31-90 days past due", "Over 90 days past due"]
    for col, label in zip(header_cols, labels):
        write_text(ws, f"{col}{w.row}", label, font=BOLD)
    w.row += 1
    values_row = w.row
    for col, value in zip(header_cols, (ageing.not_due, ageing.d1_30, ageing.d31_90, ageing.over_90)):
        cell = ws[f"{col}{w.row}"]
        cell.value = value
        cell.number_format = THOUSANDS_FMT
    w.row += 1
    if check_against_row is not None and check_key is not None:
        check_row = w.formula_row(
            "Check: ageing total less gross balance above (should equal zero)",
            f"=SUM(B{values_row}:E{values_row})-{CUR_COL}{check_against_row}",
        )
        w.key(check_key, check_row, prior=False)
    w.blank()


def build_schedules(
    ws: Worksheet, contract, key_cells: dict[str, str]
) -> SchedulesRefs:
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions[LABEL_COL].width = 52
    for col in ("C", "D", "E"):
        ws.column_dimensions[col].width = 18

    w = SheetWriter(ws)
    w.title_block(
        contract.client_name,
        "Supporting Schedules to the Financial Statements",
        contract.period_label,
        contract.units_label,
    )
    w.year_header()

    s = contract.schedules
    _simple_schedule(
        w, "Schedule 1: Revenue disaggregation (IFRS 15)", s.revenue,
        "Total revenue (links to P&L)", "schedules:revenue_total",
    )
    _simple_schedule(
        w, "Schedule 2: Cost of sales", s.cost_of_sales,
        "Total cost of sales (links to P&L)", "schedules:cos_total",
    )
    _simple_schedule(
        w, "Schedule 3: Distribution costs", s.distribution_costs,
        "Total distribution costs (links to P&L)", "schedules:distribution_total",
    )
    _simple_schedule(
        w, "Schedule 4: Administrative expenses", s.admin_expenses,
        "Total administrative expenses (links to P&L)", "schedules:admin_total",
    )
    _ppe_grid(w, ws, s)
    _simple_schedule(
        w, "Schedule 6: Inventories", s.inventories,
        "Total inventories (links to SOFP)", "schedules:inventories_total",
    )

    w.section("Schedule 7: Trade and other receivables")
    receivables_first = w.row
    for line in s.receivables:
        w.input_row(line.label, line.current, line.prior)
    cur, pri = w.sum_rows(receivables_first, w.row - 1)
    recv_total = w.formula_row(
        "Total trade and other receivables (links to SOFP)", cur, pri, bold=True, border="top"
    )
    w.key("schedules:receivables_total", recv_total)
    w.blank()
    _ageing_block(
        w, ws,
        "Ageing analysis of gross trade receivables (current year, informational)",
        s.receivables_ageing,
        check_against_row=receivables_first if s.receivables else None,
        check_key="schedules:receivables_ageing_check",
    )

    w.section("Schedule 8: Trade and other payables")
    payables_first = w.row
    for line in s.payables:
        w.input_row(line.label, line.current, line.prior)
    cur, pri = w.sum_rows(payables_first, w.row - 1)
    pay_total = w.formula_row(
        "Total trade and other payables (links to SOFP)", cur, pri, bold=True, border="top"
    )
    w.key("schedules:payables_total", pay_total)
    w.blank()
    _ageing_block(
        w, ws,
        "Ageing analysis of trade payables (current year, informational)",
        s.payables_ageing,
    )

    for name, local_ref in w.key_cells.items():
        key_cells[name] = sheet_ref(SHEET, local_ref)

    def q(name: str) -> str:
        return key_cells[name]

    return SchedulesRefs(
        revenue_total=q("schedules:revenue_total"),
        revenue_total_py=q("schedules:revenue_total:py"),
        cos_total=q("schedules:cos_total"),
        cos_total_py=q("schedules:cos_total:py"),
        distribution_total=q("schedules:distribution_total"),
        distribution_total_py=q("schedules:distribution_total:py"),
        admin_total=q("schedules:admin_total"),
        admin_total_py=q("schedules:admin_total:py"),
        ppe_nbv_total=q("schedules:ppe_nbv_total"),
        inventories_total=q("schedules:inventories_total"),
        inventories_total_py=q("schedules:inventories_total:py"),
        receivables_total=q("schedules:receivables_total"),
        receivables_total_py=q("schedules:receivables_total:py"),
        payables_total=q("schedules:payables_total"),
        payables_total_py=q("schedules:payables_total:py"),
    )

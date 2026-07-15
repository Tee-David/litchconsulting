"""Mapping-layer suite: aggregation invariants, the taxonomy↔bindings
bijection for both variants, and line items → contract → compiled workbook →
LibreOffice recompute end-to-end."""
import pytest

from litchai.mapping import (
    EXCLUDED_FROM_STATEMENTS,
    LineItemRow,
    MappingError,
    aggregate,
    bindings_for,
    build_annual_report_contract,
)
from litchai.taxonomy import load_taxonomy

TAX = load_taxonomy()


def test_aggregate_nets_by_direction():
    items = [
        LineItemRow(1, "revenue.goods", "in", 1000),
        LineItemRow(2, "revenue.goods", "in", 500),
        LineItemRow(3, "revenue.goods", "out", 200),  # e.g. a refund
    ]
    totals = aggregate(items, TAX)
    total = totals["revenue.goods"]
    assert (total.inflow, total.outflow, total.net) == (1500, 200, 1300)
    assert total.line_item_ids == (1, 2, 3)


@pytest.mark.parametrize(
    "item, message",
    [
        (LineItemRow(1, "ghost.code", "in", 10), "unknown category"),
        (LineItemRow(1, "admin", "out", 10), "non-postable"),
        (LineItemRow(1, "revenue.goods", "in", -10), "negative amount"),
    ],
)
def test_aggregate_rejects_bad_items(item, message):
    with pytest.raises(MappingError, match=message):
        aggregate([item], TAX)


@pytest.mark.parametrize("variant", ["ias1", "ifrs18"])
def test_bindings_bijection(variant):
    bindings = bindings_for(variant)
    by_code = TAX.by_code()

    # Every binding names a real, postable, transaction-sourced leaf.
    for binding in bindings:
        category = by_code[binding.category_code]
        assert category.postable, binding.category_code
        assert category.source == "transactions", binding.category_code

    # Every postable transaction leaf reaches exactly one P&L/schedules row
    # (accrual placement), or is explicitly excluded. Cash-movement leaves
    # instead reach exactly one SOCF row.
    face = {}
    socf = {}
    for binding in bindings:
        target = face if not binding.contract_path.startswith("socf.") else socf
        target.setdefault(binding.category_code, []).append(binding.contract_path)

    for category in TAX.postable_leaves():
        if category.source != "transactions" or category.code in EXCLUDED_FROM_STATEMENTS:
            continue
        if category.nature == "cash_movement":
            assert len(socf.get(category.code, [])) == 1, category.code
        else:
            assert len(face.get(category.code, [])) == 1, category.code


def _aux(variant: str) -> dict:
    return {
        "client_name": "Mapping Test Ltd",
        "period_label": "For the year ended 31 December 2025",
        "as_at_label": "As at 31 December 2025",
        "schedules": {
            "cost_of_sales": [
                {"label": "Opening inventory", "current": 300, "prior": 250},
                {"label": "Less: Closing inventory", "current": -400, "prior": -300},
            ],
            "ppe_classes": [
                {"label": "Plant", "cost_opening": 900, "dep_opening": 100, "dep_charge": 50}
            ],
        },
        "sofp": {"cash_prior": 80, "share_capital": {"current": 500, "prior": 500}},
        "bank_recon": {
            "account_label": "Test Bank | December 2025",
            "statement_balance": 120,
            "book_balance": 120,
        },
        "socf": {"opening_cash": {"current": 80, "prior": 60}},
        "schedules_prior": {"revenue.goods": 800, "dist.freight": 40},
    }


ITEMS = [
    LineItemRow(1, "revenue.goods", "in", 700),
    LineItemRow(2, "revenue.goods", "in", 300),
    LineItemRow(3, "cos.purchases", "out", 450),
    LineItemRow(4, "dist.freight", "out", 60),
    LineItemRow(5, "bank.charges", "out", 15),
    LineItemRow(6, "finance.costs.interest", "out", 25),
    LineItemRow(7, "tax.income_tax", "out", 30),
    LineItemRow(8, "capex.ppe.additions", "out", 200),
    LineItemRow(9, "fin_activity.borrow_proceeds", "in", 150),
    LineItemRow(10, "transfers.internal", "out", 999),  # must be ignored
]


@pytest.mark.parametrize("variant", ["ias1", "ifrs18"])
def test_build_contract_from_line_items(variant):
    contract, lineage = build_annual_report_contract(
        aggregate(ITEMS, TAX), _aux(variant), variant, TAX
    )

    revenue = {line.label: line for line in contract.schedules.revenue}
    assert revenue["Sale of goods"].current == 1000
    assert revenue["Sale of goods"].prior == 800  # from schedules_prior

    cos_labels = [line.label for line in contract.schedules.cost_of_sales]
    assert cos_labels[0] == "Opening inventory"
    assert cos_labels[-1] == "Less: Closing inventory"  # contra stays last
    assert "Purchases/production costs" in cos_labels

    admin = {line.label: line for line in contract.schedules.admin_expenses}
    assert admin["Bank charges (COT/SMS/stamp duty/maintenance)"].current == 15

    if variant == "ias1":
        assert contract.pnl.finance_costs.current == -25
        assert contract.socf.finance_costs_addback.current == 25  # derived negation
    else:
        assert contract.pnl.interest_on_borrowings.current == -25
    assert contract.pnl.income_tax_expense.current == -30
    assert contract.socf.tax_paid.current == -30
    assert contract.socf.ppe_purchases.current == -200
    assert contract.socf.borrowings_proceeds.current == 150

    by_path = {entry.contract_path: entry for entry in lineage}
    revenue_entry = next(
        entry for path, entry in by_path.items() if path.startswith("schedules.revenue[")
    )
    assert revenue_entry.category_codes == ("revenue.goods",)
    assert revenue_entry.line_item_ids == (1, 2)
    assert by_path["socf.tax_paid"].line_item_ids == (7,)
    assert not any("transfers" in str(e.category_codes) for e in lineage)


def test_suspense_blocks_build():
    items = ITEMS + [LineItemRow(99, "suspense.uncategorized", "out", 5)]
    with pytest.raises(MappingError, match="uncategorized"):
        build_annual_report_contract(aggregate(items, TAX), _aux("ias1"), "ias1", TAX)


def test_mapped_contract_compiles_and_recomputes(tmp_path):
    from litchai.compilers.annual_report import compile_annual_report
    from litchai.validation import recompute

    contract, _ = build_annual_report_contract(aggregate(ITEMS, TAX), _aux("ias1"), "ias1", TAX)
    result = compile_annual_report(contract)
    path = tmp_path / "mapped.xlsx"
    result.workbook.save(path)
    grids = recompute.recompute_workbook(path)
    assert recompute.find_workbook_errors(grids) == []
    assert recompute.value_at_ref(grids, result.key_cells["schedules:revenue_total"]) == 1000
    # 300 opening + 450 purchases - 400 closing
    assert recompute.value_at_ref(grids, result.key_cells["schedules:cos_total"]) == 350
    assert recompute.value_at_ref(grids, result.key_cells["pnl:gross_profit"]) == 650

"""Tests for the deterministic review-facts grounding layer.

These prove the assistant will have accurate ground truth to narrate over:
explanations carry the real formula + recomputed value, and the anomaly flags
fire on crafted fixtures (doubled-rent outlier, negative revenue, a bank rec
that doesn't tie out).
"""
import json
from pathlib import Path

import pytest

from litchai.compilers.bank_rec import compile_bank_rec
from litchai.compilers.pnl import compile_pnl
from litchai.contracts.bank_rec import BankRecContract
from litchai.contracts.pnl import PnLContract
from litchai.review import facts
from litchai.validation import recompute

FIXTURES = Path(__file__).parent.parent / "fixtures" / "synthetic"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _compile_to_grid(compiled, tmp_path):
    path = tmp_path / "out.xlsx"
    compiled.workbook.save(path)
    return recompute.recompute_to_grid(path)


def test_explanations_carry_formula_and_value(tmp_path):
    contract = PnLContract.model_validate(_load("pnl_basic.json"))
    compiled = compile_pnl(contract)
    grid = _compile_to_grid(compiled, tmp_path)
    pack = facts.build_review_pack("pnl", compiled, grid, contract)

    by_name = {e.name: e for e in pack.explanations}
    net = by_name["net_profit"]
    assert net.kind == "computed"
    assert net.formula.startswith("=")
    assert net.input_refs  # depends on other cells
    # Value matches the recomputed grid and the golden arithmetic.
    expected = (
        sum(i.amount for i in contract.revenue)
        - sum(i.amount for i in contract.cost_of_sales)
        - sum(i.amount for i in contract.operating_expenses)
        + sum(i.amount for i in contract.other_income)
    )
    assert net.value == pytest.approx(expected, abs=0.01)


def test_pnl_anomalies_flag_outlier_and_negative(tmp_path):
    contract = PnLContract.model_validate(_load("pnl_anomaly.json"))
    compiled = compile_pnl(contract)
    grid = _compile_to_grid(compiled, tmp_path)
    pack = facts.build_review_pack("pnl", compiled, grid, contract)
    codes = {a.code for a in pack.anomalies}
    assert "outlier_line" in codes  # doubled rent dominates opex
    assert "negative_revenue" in codes


def test_clean_pnl_has_no_anomalies(tmp_path):
    contract = PnLContract.model_validate(_load("pnl_basic.json"))
    compiled = compile_pnl(contract)
    grid = _compile_to_grid(compiled, tmp_path)
    pack = facts.build_review_pack("pnl", compiled, grid, contract)
    assert pack.anomalies == []


def test_bank_rec_unbalanced_flags_does_not_reconcile(tmp_path):
    contract = BankRecContract.model_validate(_load("bank_rec_unbalanced.json"))
    compiled = compile_bank_rec(contract)
    grid = _compile_to_grid(compiled, tmp_path)
    pack = facts.build_review_pack("bank_rec", compiled, grid, contract)
    flags = [a for a in pack.anomalies if a.code == "does_not_reconcile"]
    assert len(flags) == 1 and flags[0].severity == "high"
    assert flags[0].amount == pytest.approx(-32500, abs=0.01)


def test_bank_rec_balanced_no_reconcile_flag(tmp_path):
    contract = BankRecContract.model_validate(_load("bank_rec_balanced.json"))
    compiled = compile_bank_rec(contract)
    grid = _compile_to_grid(compiled, tmp_path)
    pack = facts.build_review_pack("bank_rec", compiled, grid, contract)
    assert all(a.code != "does_not_reconcile" for a in pack.anomalies)


def test_review_pack_serializes(tmp_path):
    contract = PnLContract.model_validate(_load("pnl_basic.json"))
    compiled = compile_pnl(contract)
    grid = _compile_to_grid(compiled, tmp_path)
    pack = facts.build_review_pack("pnl", compiled, grid, contract)
    d = pack.to_dict()
    assert d["template"] == "pnl"
    assert d["summaries"][0]["label"] == "Revenue"
    assert isinstance(json.dumps(d), str)  # JSON-serializable for the future API/LLM

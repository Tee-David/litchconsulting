"""Tests for the synthetic bank-statement generator."""
import pytest

from litchai.fixtures_gen import generate_statement


def test_deterministic_per_seed():
    a = generate_statement(seed=42, months=3)
    b = generate_statement(seed=42, months=3)
    assert a == b


def test_different_seeds_differ():
    a = generate_statement(seed=1, months=3)
    b = generate_statement(seed=2, months=3)
    assert a != b


def test_clean_running_balance_is_consistent():
    stmt = generate_statement(seed=7, months=4, messy=False)
    balance = stmt.opening_balance
    for row in stmt.rows:
        balance += row.money_in - row.money_out
        assert row.balance == pytest.approx(balance, abs=0.01)


def test_each_row_is_one_sided():
    stmt = generate_statement(seed=3, months=2)
    for row in stmt.rows:
        assert (row.money_in > 0) != (row.money_out > 0)


def test_messy_drops_some_balances_but_stays_deterministic():
    a = generate_statement(seed=9, months=6, messy=True)
    b = generate_statement(seed=9, months=6, messy=True)
    assert a == b
    assert any(row.balance is None for row in a.rows)

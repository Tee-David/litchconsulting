"""The workbench scorecard in CI, with no model: every task's oracle (the tool and
arguments a correct answer uses) must give the task's golden figures. A paid model
run is separate (python -m litchai.evals.workbench --provider deepseek)."""
from __future__ import annotations

import pytest

from litchai.evals.workbench import load_tasks, verify_task

TASKS = load_tasks()["tasks"]


@pytest.mark.parametrize("task", TASKS, ids=[t["id"] for t in TASKS])
def test_oracle_gives_the_golden(task):
    pytest.importorskip("duckdb")  # query_sql tasks; CI has it
    assert verify_task(task) == []

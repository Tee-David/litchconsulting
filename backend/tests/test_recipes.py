"""Year-end recipe (plan v5 slice C): a fixed plan with no model, review points with
sources, statements labelled 'before adjustments'."""
from __future__ import annotations

from test_bankrec import _job, _x

from litchai.evals.fixtures import scripted_categoriser
from litchai.evals.workbench import _taxonomy
from litchai.workbench.engine import TurnDeps, run_turn
from litchai.workbench.recipes import wants_year_end

GTB = _x({"Statement": [["Trans Date", "Narration", "Reference", "Debit", "Credit", "Balance"],
                        ["2025-12-01", "OPENING BALANCE", None, None, None, 66_192_828.81],
                        ["2025-12-05", "TRF TO CFAO MOTORS - DELIVERY VAN", None, 22_000_000, None,
                         44_192_828.81],
                        ["2025-12-10", "TRF TO GREENFIELD SCHOOL - FEES OKOYE CHILDREN", None,
                         5_200_000, None, 38_992_828.81]]})


class NoModel:
    def complete(self, *a, **k):  # the recipe must not call a model
        raise AssertionError("no model call expected")


def test_year_end_review_runs_with_no_model():
    assert wants_year_end("conduct a year-end review and identify adjustments required")
    w, conv = _job(GTB, "GTBank_Statement_FY2025.xlsx")
    deps = TurnDeps(w, NoModel(), taxonomy=_taxonomy(), categoriser=scripted_categoriser)
    events = list(run_turn(deps, conv, "Do the year-end review of the trial balance."))
    final = events[-1]
    assert final["type"] == "final" and final["fast_path"]
    tools = [e["tool"] for e in events if e["type"] == "tool_call"]
    assert tools[:2] == ["sources_sheet", "bank_rec"] and "review_points" in tools
    text = final["answer"]
    assert "Unpresented cheques 1,200,000.00" in text
    assert "DELIVERY VAN" in text and "director's current account" in text
    assert "Before adjustments:" in text

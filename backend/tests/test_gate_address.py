"""The recompute gate names the right cell (19 Nov: it was one row and one column off)."""
from __future__ import annotations

from unittest import mock

from litchai.workbench import ops


def test_gate_error_address_is_the_formula_cell():
    grids = {"Sheet": [["5", "10"], ["0", "#DIV/0!"]]}  # the error is in B2
    with mock.patch.object(ops.shutil, "which", return_value="/usr/bin/soffice"), \
            mock.patch.object(ops, "_recompute_keep", return_value=(grids, None)), \
            mock.patch.object(ops, "count_formulas", return_value=1), \
            mock.patch.object(ops, "_ironcalc_shadow"):
        r = ops.libreoffice_gate(b"x")
    assert r.status == "blocked" and r.errors == ["Sheet!B2: #DIV/0!"]

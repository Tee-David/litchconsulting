"""Loads the shared Nigerian tax config.

`frontend/src/lib/tax/nigeria-tax-config.json` is the single source of truth
for tax rates, used by both the site calculators and these template compilers
(plans/prd.md §12). Compilers record the config's `version` in every generated
file (FR9).
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

CONFIG_RELPATH = Path("frontend/src/lib/tax/nigeria-tax-config.json")


def _find_config() -> Path:
    override = os.environ.get("LITCHAI_TAX_CONFIG")
    if override:
        return Path(override)
    for parent in Path(__file__).resolve().parents:
        candidate = parent / CONFIG_RELPATH
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        f"{CONFIG_RELPATH} not found in any parent of {__file__}; "
        "run from the repo checkout or set LITCHAI_TAX_CONFIG"
    )


@lru_cache(maxsize=1)
def load_tax_config() -> dict:
    with _find_config().open(encoding="utf-8") as fh:
        return json.load(fh)

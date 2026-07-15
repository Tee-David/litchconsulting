"""Deterministic contract builder: CategoryTotals + aux inputs → annual-report
contract + lineage sidecar.

Aux carries everything transactions cannot know (labels, SOFP inputs, bank
recon, SOCF non-cash rows, prior-year values, aux schedule lines like
opening/closing inventory). Bound values ACCUMULATE onto the aux skeleton;
accrual overrides (e.g. tax expense ≠ tax paid) are HITL corrections, not
mapping logic. Nothing is silently dropped: a non-excluded category with
activity and no binding is an error, and suspense items block the build.
"""
from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Literal

from litchai.contracts.annual_report import (
    AnnualReportContract,
    AnnualReportIAS1Contract,
    AnnualReportIFRS18Contract,
)
from litchai.mapping.bindings import EXCLUDED_FROM_STATEMENTS, Binding, bindings_for
from litchai.mapping.totals import CategoryTotals, MappingError
from litchai.taxonomy import SUSPENSE_CODE, Taxonomy


@dataclass(frozen=True)
class LineageEntry:
    """How a contract value came to be: which categories, which line items."""

    contract_path: str
    category_codes: tuple[str, ...]
    line_item_ids: tuple[int, ...]


def _ensure(node: dict, key: str) -> dict:
    return node.setdefault(key, {})


def _set_scalar(data: dict, path: str, delta: float) -> None:
    parts = path.split(".")
    node = data
    for part in parts[:-1]:
        node = _ensure(node, part)
    pair = node.setdefault(parts[-1], {"current": 0.0, "prior": 0.0})
    pair["current"] = float(pair.get("current", 0.0)) + delta


def build_annual_report_contract(
    totals: CategoryTotals,
    aux: dict,
    variant: Literal["ias1", "ifrs18"],
    taxonomy: Taxonomy,
) -> tuple[AnnualReportContract, list[LineageEntry]]:
    suspense = totals.get(SUSPENSE_CODE)
    if suspense and suspense.line_item_ids:
        raise MappingError(
            f"{len(suspense.line_item_ids)} uncategorized line items block the build "
            f"(ids {list(suspense.line_item_ids)[:10]}…)"
        )

    bindings = bindings_for(variant)
    by_category: dict[str, list[Binding]] = {}
    for binding in bindings:
        by_category.setdefault(binding.category_code, []).append(binding)

    unbound = [
        code
        for code, total in totals.items()
        if code not in by_category
        and code not in EXCLUDED_FROM_STATEMENTS
        and (total.inflow or total.outflow)
    ]
    if unbound:
        raise MappingError(f"categories with activity but no {variant} binding: {sorted(unbound)}")

    data = copy.deepcopy(aux)
    data["standard"] = variant
    categories = taxonomy.by_code()
    schedules_prior: dict[str, float] = data.pop("schedules_prior", {})
    lineage: dict[str, LineageEntry] = {}

    def record(path: str, code: str, ids: tuple[int, ...]) -> None:
        prev = lineage.get(path)
        lineage[path] = LineageEntry(
            contract_path=path,
            category_codes=(*(prev.category_codes if prev else ()), code),
            line_item_ids=(*(prev.line_item_ids if prev else ()), *ids),
        )

    # Schedule lists: aux non-"Less:" lines keep the head, transaction lines
    # append after them, "Less:" contra lines stay at the bottom (template
    # display convention). Order is cosmetic — totals are SUM formulas.
    schedule_bindings = [b for b in bindings if b.contract_path.startswith("schedules.")]
    lists_touched = {b.contract_path.split(".")[1] for b in schedule_bindings}
    schedules_node = _ensure(data, "schedules")
    heads_tails = {
        name: (
            [
                line
                for line in schedules_node.get(name, [])
                if not str(line.get("label", "")).startswith("Less:")
            ],
            [
                line
                for line in schedules_node.get(name, [])
                if str(line.get("label", "")).startswith("Less:")
            ],
        )
        for name in lists_touched
    }
    inserted: dict[str, list[dict]] = {name: [] for name in lists_touched}
    for binding in schedule_bindings:
        total = totals.get(binding.category_code)
        if total is None:
            continue
        name = binding.contract_path.split(".")[1]
        inserted[name].append(
            {
                "label": categories[binding.category_code].label,
                "current": binding.sign * total.net,
                "prior": schedules_prior.get(binding.category_code, 0.0),
                "_code": binding.category_code,
                "_ids": total.line_item_ids,
            }
        )
    for name in lists_touched:
        head, tail = heads_tails[name]
        final = head + inserted[name] + tail
        for index, line in enumerate(final):
            code = line.pop("_code", None)
            ids = line.pop("_ids", ())
            if code is not None:
                record(f"schedules.{name}[{index}]", code, tuple(ids))
        schedules_node[name] = final

    # Scalar YearPair fields (P&L faces and SOCF placements).
    for binding in bindings:
        if binding.contract_path.startswith("schedules."):
            continue
        total = totals.get(binding.category_code)
        if total is None:
            continue
        _set_scalar(data, binding.contract_path, binding.sign * total.net)
        record(binding.contract_path, binding.category_code, total.line_item_ids)

    # IAS 1 starts its cash flow from profit before tax, so the P&L finance
    # items are added back. v1 is cash-basis: the add-back is exactly the
    # negation of the mapped P&L figure (deterministic derivation, only when
    # aux didn't supply one).
    if variant == "ias1":
        socf_node = _ensure(data, "socf")
        pnl_node = data.get("pnl", {})
        for source, target in (
            ("finance_costs", "finance_costs_addback"),
            ("finance_income", "finance_income_addback"),
        ):
            if target not in socf_node and source in pnl_node:
                socf_node[target] = {
                    "current": -float(pnl_node[source].get("current", 0.0)),
                    "prior": -float(pnl_node[source].get("prior", 0.0)),
                }

    cls = AnnualReportIAS1Contract if variant == "ias1" else AnnualReportIFRS18Contract
    contract = cls.model_validate(data)
    return contract, sorted(lineage.values(), key=lambda e: e.contract_path)

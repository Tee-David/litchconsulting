"""Deterministic review-facts grounding layer.

The conversational review assistant (PRD: "Conversational review assistant")
must **explain, never invent** — so it narrates over structured facts derived
here, not over free generation. Given a compiled workbook + its recomputed grid
+ the source contract, this module produces a `ReviewPack`:

- **cell explanations** — every key cell's formula, its input cells, and its
  recomputed value (the "show me how you got net profit" answer);
- **anomaly flags** — deterministic heuristics a reviewer should eyeball
  (outliers, negatives, a bank rec that doesn't tie out, non-positive net pay);
- **section summaries** — totals with share-of-parent for a fast scan.

No AI here. This is the ground truth the LLM later reads. The correction-apply
loop (instruction → contract edit → re-compile → re-gate) is Phase 4.
"""
from __future__ import annotations

import re
import statistics
from dataclasses import asdict, dataclass, field

from litchai.compilers._common import CompiledTemplate
from litchai.validation import recompute

_CELL_REF = re.compile(r"\$?([A-Z]{1,3})\$?(\d+)")


@dataclass
class CellExplanation:
    name: str
    ref: str
    kind: str  # "computed" | "input"
    formula: str | None
    input_refs: list[str]
    value: float


@dataclass
class Anomaly:
    severity: str  # "info" | "warning" | "high"
    code: str
    message: str
    refs: list[str] = field(default_factory=list)
    amount: float | None = None


@dataclass
class SectionSummary:
    label: str
    total: float
    pct_of_parent: float | None = None


@dataclass
class ReviewPack:
    template: str
    compiler_version: str
    explanations: list[CellExplanation]
    anomalies: list[Anomaly]
    summaries: list[SectionSummary]

    def to_dict(self) -> dict:
        return asdict(self)


def _extract_refs(formula: str) -> list[str]:
    """Cell refs a formula depends on (range endpoints included, $ stripped)."""
    seen: list[str] = []
    for col, row in _CELL_REF.findall(formula):
        ref = f"{col}{row}"
        if ref not in seen:
            seen.append(ref)
    return seen


def explain_cells(compiled: CompiledTemplate, grid: list[list[str]]) -> list[CellExplanation]:
    ws = compiled.workbook.active
    out: list[CellExplanation] = []
    for name, ref in compiled.key_cells.items():
        raw = ws[ref].value
        if isinstance(raw, str) and raw.startswith("="):
            kind, formula, refs = "computed", raw, _extract_refs(raw)
        else:
            kind, formula, refs = "input", None, []
        try:
            value = recompute.value_at(grid, ref)
        except recompute.RecomputeError:
            value = float("nan")
        out.append(CellExplanation(name, ref, kind, formula, refs, value))
    return out


def _pct(part: float, whole: float) -> float | None:
    return (part / whole) if whole else None


def _outliers(section_label: str, items, factor: float = 3.0, min_items: int = 3) -> list[Anomaly]:
    """Flag a line that dwarfs its peers — > `factor`× the median of the other
    lines in a section of at least `min_items`. This catches a doubled/mis-keyed
    entry without firing on a section that is simply concentrated (e.g. purchases
    dominating cost of sales, or a normally salary-heavy expense list)."""
    positives = [i for i in items if i.amount > 0]
    if len(positives) < min_items:
        return []
    amounts = [i.amount for i in positives]
    out: list[Anomaly] = []
    for j, item in enumerate(positives):
        others = amounts[:j] + amounts[j + 1:]
        median_others = statistics.median(others)
        if median_others > 0 and item.amount > factor * median_others:
            multiple = item.amount / median_others
            out.append(
                Anomaly(
                    "info",
                    "outlier_line",
                    f"'{item.label}' is {multiple:.1f}× the typical {section_label} line "
                    f"(₦{item.amount:,.2f})",
                    amount=item.amount,
                )
            )
    return out


# --- Per-template anomaly detectors -----------------------------------------

def detect_pnl_anomalies(contract) -> list[Anomaly]:
    out: list[Anomaly] = []
    for item in contract.revenue:
        if item.amount < 0:
            out.append(
                Anomaly(
                    "warning",
                    "negative_revenue",
                    f"Revenue line '{item.label}' is negative (₦{item.amount:,.2f})",
                    amount=item.amount,
                )
            )
    out += _outliers("cost of sales", contract.cost_of_sales)
    out += _outliers("operating expenses", contract.operating_expenses)
    return out


def detect_ledger_anomalies(contract) -> list[Anomaly]:
    out: list[Anomaly] = []
    misc = {"misc", "miscellaneous", "uncategorized", "uncategorised", "other", "others"}
    total_out = sum(t.amount for t in contract.transactions if t.direction == "out")
    misc_out = sum(
        t.amount for t in contract.transactions
        if t.direction == "out" and t.category.strip().lower() in misc
    )
    if total_out > 0 and misc_out / total_out > 0.2:
        out.append(
            Anomaly(
                "warning",
                "large_uncategorized",
                f"Uncategorized spend is {misc_out / total_out:.0%} of outflows (₦{misc_out:,.2f})",
                amount=misc_out,
            )
        )
    seen: set[tuple[float, str, str]] = set()
    for t in contract.transactions:
        signature = (round(t.amount, 2), t.direction, t.category)
        if signature in seen:
            out.append(
                Anomaly(
                    "info",
                    "possible_duplicate",
                    f"Possible duplicate: '{t.description}' (₦{t.amount:,.2f}) repeats in {t.category}",
                    amount=t.amount,
                )
            )
        else:
            seen.add(signature)
    return out


def detect_bank_rec_anomalies(contract, grid, key_cells) -> list[Anomaly]:
    diff = recompute.value_at(grid, key_cells["difference"])
    if abs(diff) > 0.01:
        return [
            Anomaly(
                "high",
                "does_not_reconcile",
                f"Reconciliation does not tie out — difference of ₦{diff:,.2f}",
                refs=[key_cells["difference"]],
                amount=diff,
            )
        ]
    return []


def detect_payroll_anomalies(contract, grid, key_cells) -> list[Anomaly]:
    out: list[Anomaly] = []
    for i, emp in enumerate(contract.employees):
        net = recompute.value_at(grid, key_cells[f"net_{i}"])
        if net <= 0:
            out.append(
                Anomaly(
                    "high",
                    "nonpositive_net",
                    f"{emp.name} has non-positive net pay (₦{net:,.2f})",
                    refs=[key_cells[f"net_{i}"]],
                    amount=net,
                )
            )
    return out


def detect_cashflow_anomalies(contract, grid, key_cells) -> list[Anomaly]:
    closing = recompute.value_at(grid, key_cells["closing_cash"])
    if closing < 0:
        return [
            Anomaly(
                "high",
                "negative_closing_cash",
                f"Closing cash is negative (₦{closing:,.2f})",
                refs=[key_cells["closing_cash"]],
                amount=closing,
            )
        ]
    return []


# --- Section summaries -------------------------------------------------------

def _summarize(kind: str, contract) -> list[SectionSummary]:
    if kind == "pnl":
        rev = sum(i.amount for i in contract.revenue)
        s = [SectionSummary("Revenue", rev)]
        for label, items in (
            ("Cost of sales", contract.cost_of_sales),
            ("Operating expenses", contract.operating_expenses),
            ("Other income", contract.other_income),
        ):
            if items:
                total = sum(i.amount for i in items)
                s.append(SectionSummary(label, total, _pct(total, rev)))
        return s
    if kind == "ledger":
        cats: dict[str, float] = {}
        for t in contract.transactions:
            cats[t.category] = cats.get(t.category, 0.0) + (t.amount if t.direction == "in" else -t.amount)
        return [SectionSummary(c, v) for c, v in sorted(cats.items())]
    if kind == "cashflow":
        def net(recs, pays):
            return sum(i.amount for i in recs) - sum(i.amount for i in pays)
        return [
            SectionSummary("Operating", net(contract.operating_receipts, contract.operating_payments)),
            SectionSummary("Investing", net(contract.investing_receipts, contract.investing_payments)),
            SectionSummary("Financing", net(contract.financing_receipts, contract.financing_payments)),
        ]
    return []


_ANOMALY_DISPATCH = {
    "pnl": lambda c, g, k: detect_pnl_anomalies(c),
    "ledger": lambda c, g, k: detect_ledger_anomalies(c),
    "bank_rec": lambda c, g, k: detect_bank_rec_anomalies(c, g, k),
    "payroll": lambda c, g, k: detect_payroll_anomalies(c, g, k),
    "cashflow": lambda c, g, k: detect_cashflow_anomalies(c, g, k),
}


def build_review_pack(
    kind: str, compiled: CompiledTemplate, grid: list[list[str]], contract
) -> ReviewPack:
    if kind not in _ANOMALY_DISPATCH:
        raise ValueError(f"unknown template kind: {kind!r}")
    return ReviewPack(
        template=kind,
        compiler_version=compiled.compiler_version,
        explanations=explain_cells(compiled, grid),
        anomalies=_ANOMALY_DISPATCH[kind](contract, grid, compiled.key_cells),
        summaries=_summarize(kind, contract),
    )


def format_explanation(e: CellExplanation) -> str:
    """One-line human rendering, the seed of the chat's 'show your work' reply."""
    if e.kind == "computed":
        return f"{e.name} at {e.ref} = {e.formula} = ₦{e.value:,.2f}"
    return f"{e.name} at {e.ref} = ₦{e.value:,.2f} (input)"

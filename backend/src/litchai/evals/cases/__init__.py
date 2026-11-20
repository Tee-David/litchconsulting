"""Real-world edge cases for Sage (plans/edge-cases-plan.md).

Each case is a realistic client job, built by code from a seed: files in mixed
formats, the requests in the client's own words (no hints), and a key: the planted
problems (with where they are and the words that show they were found), the key
figures, and the key journals. A program scores a run, so scoring costs no model.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Problem:
    id: str
    title: str
    # Regex groups: the problem counts as found when EVERY group matches the answers.
    words: list[str]
    amount: float | None = None   # the money at stake (a match within 1% also counts)
    where: str = ""               # file and rows/cells, for the report


@dataclass
class Case:
    slug: str
    client: str
    period: str
    files: dict[str, bytes]
    prompts: list[str]
    problems: list[Problem]
    figures: dict[str, float] = field(default_factory=dict)
    notes: str = ""


_NUM = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?")


def _numbers(text: str) -> list[float]:
    out = []
    for whole, frac in _NUM.findall(text):
        try:
            out.append(float(whole.replace(",", "") + (frac or "")))
        except ValueError:
            pass
    return out


def found(problem: Problem, text: str) -> bool:
    if all(re.search(w, text, re.IGNORECASE | re.DOTALL) for w in problem.words):
        return True
    if problem.amount:
        nums = _numbers(text)
        hit = any(abs(n - problem.amount) <= max(1.0, 0.01 * abs(problem.amount)) for n in nums)
        # an amount alone counts only next to one of the problem's words
        return hit and any(re.search(w, text, re.IGNORECASE) for w in problem.words)
    return False


def score(case: Case, answers: list[str], extra_text: str = "") -> dict[str, Any]:
    """Found / missed per problem, from all answers (and review points or sheet text)."""
    text = "\n".join(answers) + "\n" + extra_text
    rows = [{"id": p.id, "title": p.title, "found": found(p, text), "where": p.where}
            for p in case.problems]
    n = sum(r["found"] for r in rows)
    return {"case": case.slug, "found": n, "of": len(rows),
            "found_pct": round(100 * n / max(1, len(rows))), "problems": rows}


def registry() -> dict[str, Any]:
    from litchai.evals.cases import (
        contractor,
        fintech,
        group,
        importer,
        manufacturer,
        ngo,
        payroll,
        property,
        purchases,
        supermarket,
    )

    return {"supermarket": supermarket.build, "contractor": contractor.build, "ngo": ngo.build,
            "payroll": payroll.build, "importer": importer.build, "property": property.build,
            "manufacturer": manufacturer.build, "fintech": fintech.build, "group": group.build,
            "purchases": purchases.build}

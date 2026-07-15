"""Taxonomy data model — the firm's versioned chart of categories.

Derived from the schedules of the two annual-report templates. Two node
kinds: postable leaves (the categorization ladder's entire answer space) and
structural nodes (subtotals/aux lines — never classification targets).
`source` separates bank-transaction-derivable leaves from stock-count/
register inputs ("aux").
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SUSPENSE_CODE = "suspense.uncategorized"

Nature = Literal["income", "expense", "asset", "liability", "equity", "cash_movement"]


class Category(BaseModel):
    code: str = Field(pattern=r"^[a-z0-9_]+(\.[a-z0-9_]+)*$")
    label: str
    parent: str | None = None
    postable: bool = False
    nature: Nature | None = None
    source: Literal["transactions", "aux"] = "transactions"
    keywords: list[str] = []
    # Exact schedule-line labels from the firm's template workbooks that map
    # to this category (the workbooks are taxonomy fixtures).
    template_labels: list[str] = []


class TaxonomyMigration(BaseModel):
    """Written when the firm edits its templates: version-to-version renames
    and splits. Splits mark dependent memory rows stale — they cannot be
    auto-remapped because the old category now means two things."""

    from_version: str
    renames: dict[str, str] = {}
    splits: dict[str, list[str]] = {}


class Taxonomy(BaseModel):
    version: str
    derived_from: list[str] = []
    categories: list[Category] = Field(min_length=1)
    migrations: list[TaxonomyMigration] = []

    def by_code(self) -> dict[str, Category]:
        return {c.code: c for c in self.categories}

    def postable_leaves(self) -> list[Category]:
        return [c for c in self.categories if c.postable]

    def template_label_index(self) -> dict[str, str]:
        """Exact template label -> category code."""
        index: dict[str, str] = {}
        for category in self.categories:
            for label in category.template_labels:
                index[label] = category.code
        return index

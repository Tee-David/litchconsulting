"""Load and validate the packaged taxonomy JSON (single source of truth,
same pattern as the shared tax config)."""
from __future__ import annotations

import json
from pathlib import Path

from litchai.taxonomy.model import SUSPENSE_CODE, Category, Taxonomy

DEFAULT_PATH = Path(__file__).parent / "litch-taxonomy.json"


class TaxonomyError(ValueError):
    pass


def load_taxonomy(path: Path | None = None) -> Taxonomy:
    taxonomy = Taxonomy.model_validate(
        json.loads((path or DEFAULT_PATH).read_text(encoding="utf-8"))
    )
    _validate(taxonomy)
    return taxonomy


def _validate(taxonomy: Taxonomy) -> None:
    by_code: dict[str, Category] = {}
    for category in taxonomy.categories:
        if category.code in by_code:
            raise TaxonomyError(f"duplicate code {category.code!r}")
        by_code[category.code] = category

    children: dict[str, list[str]] = {}
    for category in taxonomy.categories:
        if category.parent is not None:
            if category.parent not in by_code:
                raise TaxonomyError(
                    f"{category.code!r} names unknown parent {category.parent!r}"
                )
            children.setdefault(category.parent, []).append(category.code)

    for category in taxonomy.categories:
        seen = {category.code}
        node = category
        while node.parent is not None:
            if node.parent in seen:
                raise TaxonomyError(f"parent cycle through {category.code!r}")
            seen.add(node.parent)
            node = by_code[node.parent]

    for category in taxonomy.categories:
        if category.postable:
            if category.nature is None:
                raise TaxonomyError(f"postable leaf {category.code!r} lacks nature")
            if children.get(category.code):
                raise TaxonomyError(f"postable {category.code!r} must be a leaf")

    if SUSPENSE_CODE not in by_code or not by_code[SUSPENSE_CODE].postable:
        raise TaxonomyError(f"taxonomy must contain the postable escape hatch {SUSPENSE_CODE!r}")

    labels: dict[str, str] = {}
    for category in taxonomy.categories:
        for label in category.template_labels:
            if label in labels:
                raise TaxonomyError(
                    f"template label {label!r} claimed by both "
                    f"{labels[label]!r} and {category.code!r}"
                )
            labels[label] = category.code

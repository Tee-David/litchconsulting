"""Rung-4 LLM classifier (Phase 3) — wires the ladder into the AI harness.

Builds a per-call :class:`TaskSpec` whose output schema is an **enum of the
shortlist codes** (Ollama JSON-Schema ``format`` — the enum constraint is the
safety boundary), runs it through :func:`litchai.ai.run_task` (cache + telemetry
+ validate chain), and returns the chosen code or ``None``. A business rule
re-checks membership as defense in depth; a rule reject goes straight to review,
never a retry.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from litchai.ai.cache import AiCache, AiTelemetry
from litchai.ai.harness import run_task
from litchai.ai.provider import Provider
from litchai.ai.tasks import TaskPolicy, TaskSpec
from litchai.categorize.ladder import LlmClassify
from litchai.taxonomy import Taxonomy


class CategoryChoice(BaseModel):
    category: str


def _schema(shortlist: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {"category": {"type": "string", "enum": shortlist}},
        "required": ["category"],
    }


def _format_shortlist(shortlist: list[str], taxonomy: Taxonomy) -> str:
    by_code = taxonomy.by_code()
    return "\n".join(
        f"- {code}: {by_code[code].label}" if code in by_code else f"- {code}"
        for code in shortlist
    )


def _format_examples(examples: list[tuple[str, str]]) -> str:
    if not examples:
        return "(none yet)"
    return "\n".join(f'- "{narration}" → {code}' for narration, code in examples)


# Prompt-input hygiene: the normalizer already stripped control chars (only
# [a-z0-9 ] survive), so the remaining risk is length. The prompt-injection blast
# radius is bounded by design — the enum shortlist + `needs_review=true` mean the
# worst a hostile narration can do is name another *valid* category, which a human
# then reviews. Capping length is defense in depth against prompt stuffing.
NARRATION_CAP = 200


def _hygiene(text: str) -> str:
    return "".join(ch for ch in text if ch == " " or ch.isalnum())[:NARRATION_CAP].strip()


def build_llm_classifier(
    provider: Provider,
    taxonomy: Taxonomy,
    *,
    cache: AiCache | None = None,
    telemetry: AiTelemetry | None = None,
) -> LlmClassify:
    def classify(normalized_text: str, shortlist: list[str], examples: list[tuple[str, str]]) -> str | None:
        spec = TaskSpec(
            name="categorize",
            prompt_version="v1",
            prompt_file="categorize.md",
            output_model=CategoryChoice,
            output_schema=_schema(shortlist),
            business_rules=lambda m, _: ([] if m.category in shortlist else [f"{m.category} off-shortlist"]),
            policy=TaskPolicy(),
        )
        inputs = {
            "narration": _hygiene(normalized_text),
            "shortlist": _format_shortlist(shortlist, taxonomy),
            "examples": _format_examples(examples),
        }
        result = run_task(
            spec, inputs, provider=provider, cache=cache, telemetry=telemetry,
            taxonomy_version=taxonomy.version,
        )
        if result.ok and isinstance(result.model, CategoryChoice):
            return result.model.category
        return None

    return classify

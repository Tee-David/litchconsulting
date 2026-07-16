"""Conversational review assistant (Phase 4) — Copilot feel, no freehand math.

ONE constrained intent-classification call over the ReviewPack (explain_cell /
walkthrough_section / recategorize / adjust_flagged_value + slots) — no open
tool-calling. Explain intents are answered **deterministically from the
ReviewPack** (facts.py), so every answer traces to a real cell. Edit intents
become a *proposed* structured correction handed to the correction-apply loop —
the assistant never writes a formula or a value itself (PRD §3, §11b).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel

from litchai.ai.cache import AiCache, AiTelemetry
from litchai.ai.harness import run_task
from litchai.ai.provider import Provider
from litchai.ai.tasks import TaskPolicy, TaskSpec
from litchai.review.facts import ReviewPack, format_explanation

Intent = Literal["explain_cell", "walkthrough_section", "recategorize", "adjust_flagged_value"]
_INTENTS = ("explain_cell", "walkthrough_section", "recategorize", "adjust_flagged_value")


class ReviewIntent(BaseModel):
    intent: Intent
    target: str | None = None
    value: str | None = None


@dataclass(frozen=True)
class ProposedCorrection:
    kind: str          # "recategorize" | "adjust_flagged_value"
    target: str
    new_value: str


@dataclass(frozen=True)
class AssistantResponse:
    intent: str
    answer: str | None = None
    proposed_correction: ProposedCorrection | None = None
    grounded_refs: list[str] = field(default_factory=list)
    needs_review: bool = False


def _intent_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "intent": {"type": "string", "enum": list(_INTENTS)},
            "target": {"type": ["string", "null"]},
            "value": {"type": ["string", "null"]},
        },
        "required": ["intent"],
    }


def _intent_spec() -> TaskSpec:
    return TaskSpec(
        name="review_intent",
        prompt_version="v1",
        prompt_file="review_intent.md",
        output_model=ReviewIntent,
        output_schema=_intent_schema(),
        policy=TaskPolicy(),
    )


def classify_intent(
    question: str,
    pack: ReviewPack,
    *,
    provider: Provider,
    cache: AiCache | None = None,
    telemetry: AiTelemetry | None = None,
) -> ReviewIntent | None:
    inputs = {
        "question": question,
        "cell_names": ", ".join(e.name for e in pack.explanations) or "(none)",
        "section_labels": ", ".join(s.label for s in pack.summaries) or "(none)",
    }
    result = run_task(_intent_spec(), inputs, provider=provider, cache=cache, telemetry=telemetry)
    return result.model if result.ok and isinstance(result.model, ReviewIntent) else None


def answer(
    question: str,
    pack: ReviewPack,
    *,
    provider: Provider,
    cache: AiCache | None = None,
    telemetry: AiTelemetry | None = None,
) -> AssistantResponse:
    intent = classify_intent(question, pack, provider=provider, cache=cache, telemetry=telemetry)
    if intent is None:
        return AssistantResponse(intent="unknown", answer="I couldn't interpret that request.")

    if intent.intent == "explain_cell":
        match = _find_cell(pack, intent.target)
        if match is None:
            return AssistantResponse(intent.intent, answer=f"No cell named {intent.target!r}.")
        return AssistantResponse(intent.intent, answer=format_explanation(match), grounded_refs=[match.ref])

    if intent.intent == "walkthrough_section":
        summary = _find_section(pack, intent.target)
        if summary is None:
            labels = ", ".join(s.label for s in pack.summaries)
            return AssistantResponse(intent.intent, answer=f"Sections: {labels}")
        pct = f" ({summary.pct_of_parent:.0%} of parent)" if summary.pct_of_parent is not None else ""
        return AssistantResponse(intent.intent, answer=f"{summary.label}: ₦{summary.total:,.2f}{pct}")

    # Edit intents → a *proposed* structured correction (never applied here).
    if intent.target and intent.value:
        kind = intent.intent
        return AssistantResponse(
            kind,
            answer=f"Proposed {kind}: {intent.target} → {intent.value} (needs your approval).",
            proposed_correction=ProposedCorrection(kind, intent.target, intent.value),
            needs_review=True,
        )
    return AssistantResponse(intent.intent, answer="I need both a target and a value for that edit.")


def _find_cell(pack: ReviewPack, target: str | None):
    if not target:
        return None
    key = target.strip().lower()
    for e in pack.explanations:
        if e.name.lower() == key or e.ref.lower() == key:
            return e
    return None


def _find_section(pack: ReviewPack, target: str | None):
    if not target:
        return None
    key = target.strip().lower()
    return next((s for s in pack.summaries if s.label.lower() == key), None)

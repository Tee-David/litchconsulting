"""Task specs + registry (Phase 3 AI harness).

A :class:`TaskSpec` binds a versioned prompt template to a pydantic output model,
a JSON schema for the provider's structured output, and a business-rule check.
Validation is a chain: JSON parse → pydantic → business rules. **Rule rejects
never retry** — they go straight to review (decision 14); only malformed output
is retried once.
"""
from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

PROMPTS_DIR = Path(__file__).parent / "prompts"


@dataclass(frozen=True)
class TaskPolicy:
    max_attempts: int = 2          # one retry for malformed output
    temperature: float = 0.0
    seed: int = 7
    num_ctx: int = 2048

    def params(self) -> dict[str, Any]:
        return {"temperature": self.temperature, "seed": self.seed, "num_ctx": self.num_ctx}


@dataclass(frozen=True)
class ValidationOutcome:
    ok: bool
    model: BaseModel | None = None
    kind: str | None = None        # 'invalid_schema' | 'rule_rejected'
    error: str | None = None


# A business rule returns a list of violation strings (empty = pass).
BusinessRules = Callable[[BaseModel, dict[str, Any]], list[str]]


@dataclass(frozen=True)
class TaskSpec:
    name: str
    prompt_version: str
    prompt_file: str
    output_model: type[BaseModel]
    output_schema: dict[str, Any]
    business_rules: BusinessRules = lambda model, inputs: []
    policy: TaskPolicy = field(default_factory=TaskPolicy)

    def template(self) -> str:
        return (PROMPTS_DIR / self.prompt_file).read_text(encoding="utf-8")

    def render(self, inputs: dict[str, Any]) -> str:
        return self.template().format(**inputs)

    def validate(self, raw_text: str, inputs: dict[str, Any]) -> ValidationOutcome:
        try:
            payload = json.loads(raw_text)
        except (json.JSONDecodeError, TypeError) as exc:
            return ValidationOutcome(ok=False, kind="invalid_schema", error=f"not json: {exc}")
        try:
            model = self.output_model.model_validate(payload)
        except ValidationError as exc:
            return ValidationOutcome(ok=False, kind="invalid_schema", error=str(exc))
        violations = self.business_rules(model, inputs)
        if violations:
            return ValidationOutcome(ok=False, kind="rule_rejected", error="; ".join(violations))
        return ValidationOutcome(ok=True, model=model)


_REGISTRY: dict[str, TaskSpec] = {}


def register_task(spec: TaskSpec) -> TaskSpec:
    _REGISTRY[spec.name] = spec
    return spec


def get_task(name: str) -> TaskSpec:
    return _REGISTRY[name]

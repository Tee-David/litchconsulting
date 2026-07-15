"""AI harness tests (Phase 3) — cache, retry, rule-reject, telemetry, render."""
import json

from litchai.ai import (
    FakeProvider,
    InMemoryCache,
    InMemoryTelemetry,
    TaskPolicy,
    TaskSpec,
    run_task,
)
from litchai.categorize.llm import CategoryChoice, _schema

SHORTLIST = ["revenue.services", "bank.charges", "suspense.uncategorized"]
INPUTS = {"narration": "paystack settlement", "shortlist": "- revenue.services: x", "examples": "(none yet)"}


def _spec():
    return TaskSpec(
        name="categorize",
        prompt_version="v1",
        prompt_file="categorize.md",
        output_model=CategoryChoice,
        output_schema=_schema(SHORTLIST),
        business_rules=lambda m, _: [] if m.category in SHORTLIST else ["off-shortlist"],
        policy=TaskPolicy(),
    )


def test_run_task_success():
    provider = FakeProvider(responder=lambda p: json.dumps({"category": "revenue.services"}))
    result = run_task(_spec(), INPUTS, provider=provider)
    assert result.ok
    assert result.output == {"category": "revenue.services"}
    assert result.attempts == 1
    assert result.cache_hit is False


def test_cache_short_circuits_second_call():
    cache = InMemoryCache()
    provider = FakeProvider(responder=lambda p: json.dumps({"category": "bank.charges"}))
    first = run_task(_spec(), INPUTS, provider=provider, cache=cache)
    second = run_task(_spec(), INPUTS, provider=provider, cache=cache)
    assert first.cache_hit is False
    assert second.cache_hit is True
    assert second.output == {"category": "bank.charges"}
    assert len(provider.calls) == 1  # provider not hit on the cached call


def test_invalid_json_retries_once_then_succeeds():
    responses = iter(["this is not json", json.dumps({"category": "bank.charges"})])
    provider = FakeProvider(responder=lambda p: next(responses))
    telemetry = InMemoryTelemetry()
    result = run_task(_spec(), INPUTS, provider=provider, telemetry=telemetry)
    assert result.ok
    assert result.attempts == 2
    assert [e.status for e in telemetry.events] == ["invalid_schema", "ok"]


def test_rule_reject_goes_straight_to_review_no_retry():
    provider = FakeProvider(responder=lambda p: json.dumps({"category": "not.on.shortlist"}))
    telemetry = InMemoryTelemetry()
    result = run_task(_spec(), INPUTS, provider=provider, telemetry=telemetry)
    assert result.ok is False
    assert result.needs_review is True
    assert result.attempts == 1                 # no retry on a rule reject
    assert len(provider.calls) == 1
    assert telemetry.events[-1].status == "rule_rejected"


def test_prompt_render_is_stable_and_escapes_braces():
    rendered = _spec().render(INPUTS)
    assert "paystack settlement" in rendered
    assert '{"category": "<code>"}' in rendered   # escaped {{ }} became literal braces
    assert "{{" not in rendered


def test_cache_key_changes_with_input():
    cache = InMemoryCache()
    provider = FakeProvider(responder=lambda p: json.dumps({"category": "bank.charges"}))
    run_task(_spec(), INPUTS, provider=provider, cache=cache)
    other = {**INPUTS, "narration": "different vendor"}
    run_task(_spec(), other, provider=provider, cache=cache)
    assert len(provider.calls) == 2  # different input -> different key -> not cached

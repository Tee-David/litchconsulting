"""Workbench eval (Phase 3.9): golden accountant tasks, runnable per provider.

Each task opens a fixture workbook, runs any ``prep`` tools (accepted, so the
model sees e.g. a categorised ledger), sends the prompt through the real
workbench turn (decision layer → agent loop → tools) and scores it:

* tools   — at least one expected tool was called and succeeded
* values  — the tool output holds the golden numbers (``checks``)
* answer  — the final answer states every golden figure, and none of the
            ``answer_excludes`` figures (prompt-injection tasks)
* pass    — all three

Run on the VM (one provider at a time, so the scores compare models, not the
fallback chain)::

    python -m litchai.evals.workbench --verify                   # oracles only, offline
    python -m litchai.evals.workbench --provider groq --provider local --out report.json
    python -m litchai.evals.workbench --provider none            # no model: degraded plan

``none`` runs the deterministic fallback plan with no model at all — the floor
every model should beat.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from importlib import resources
from pathlib import Path
from typing import Any

from litchai.evals.fixtures import FIXTURES, QA_FIXTURES, qa_files, scripted_categoriser
from litchai.workbench.ops import GateResult

TOLERANCE = 0.005  # 0.5% for figures quoted in prose (rounding to "4.56m" etc.)


def load_tasks() -> dict[str, Any]:
    raw = resources.files("litchai.evals").joinpath("workbench_tasks.json").read_text("utf-8")
    return json.loads(raw)


# --- value checks ---------------------------------------------------------------
def get_path(data: Any, path: str) -> Any:
    cur = data
    for part in path.split("."):
        if isinstance(cur, list):
            cur = cur[int(part)] if part.isdigit() and int(part) < len(cur) else None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
        if cur is None:
            return None
    return cur


def _numbers(obj: Any) -> list[float]:
    out: list[float] = []
    if isinstance(obj, bool):
        return out
    if isinstance(obj, int | float):
        out.append(float(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            out.extend(_numbers(v))
    elif isinstance(obj, list | tuple):
        for v in obj:
            out.extend(_numbers(v))
    return out


def _close(a: float, b: float, rel: float = 1e-6) -> bool:
    return abs(a - b) <= max(0.01, abs(b) * rel)


def check_value(data: Any, check: dict[str, Any]) -> bool:
    if "any_number" in check:
        return any(_close(n, float(check["any_number"])) for n in _numbers(data))
    got = get_path(data, check["path"])
    if "equals" in check:
        want = check["equals"]
        if isinstance(want, (bool, str)):
            return got == want
        return isinstance(got, int | float) and not isinstance(got, bool) and \
            _close(float(got), float(want))
    if "gte" in check:
        return isinstance(got, int | float) and got >= check["gte"]
    raise ValueError(f"unknown check {check}")


# --- figures in prose -----------------------------------------------------------
_NUM = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(million|mn|m|k|bn|billion)?\b",
                  re.IGNORECASE)
_SCALE = {"k": 1e3, "m": 1e6, "mn": 1e6, "million": 1e6, "bn": 1e9, "billion": 1e9}
_ZERO_WORDS = re.compile(r"\b(zero|nil|no difference|balances|balanced|reconciles|"
                         r"not payable|no cit|exempt)\b", re.IGNORECASE)


def figures_in(text: str) -> list[float]:
    out = []
    for whole, frac, scale in _NUM.findall(text or ""):
        n = float(whole.replace(",", "") + (frac or ""))
        out.append(n * _SCALE.get((scale or "").lower(), 1.0))
    return out


def states_figure(text: str, figure: float) -> bool:
    if figure == 0:
        return bool(_ZERO_WORDS.search(text or "")) or any(n == 0 for n in figures_in(text))
    return any(abs(n - figure) <= abs(figure) * TOLERANCE for n in figures_in(text))


# --- running ----------------------------------------------------------------------
def passing_gate(xlsx: bytes) -> GateResult:
    return GateResult("unverified", engine="eval", detail="recompute skipped in evals")


def _workbench(task: dict[str, Any]) -> tuple[Any, Any]:
    from litchai.workbench.session import InMemoryBlobStore, InMemoryConversationStore, Workbench

    wb = Workbench(InMemoryBlobStore(), InMemoryConversationStore(), gate=passing_gate)
    conv = wb.create(client_id=None, client_name="Okonkwo Agro-Allied Ltd",
                     period_label="Q1 2025")
    fixture = task["fixture"]
    if fixture in QA_FIXTURES:
        from litchai.workbench.formats import to_working_copy

        conv.client_name, conv.period_label = "Kanem Logistics Nigeria Ltd", "FY2025"
        for i, (name, data) in enumerate(qa_files(fixture), start=1):
            copy = to_working_copy(data, name, wb_id=f"doc-{i}", document_id=i)
            wb.attach_bytes(conv, copy.xlsx, name=name, origin=copy.origin, document_id=i,
                            source=copy.source(name))
        return wb, conv
    wb.attach_bytes(conv, FIXTURES[fixture](), name=f"{fixture}.xlsx", document_id=1)
    return wb, conv


def _taxonomy() -> Any:
    from litchai.taxonomy import load_taxonomy

    return load_taxonomy()


def prepare(task: dict[str, Any], prep: list | None = None) -> tuple[Any, Any]:
    """Fixture + accepted prep steps."""
    from litchai.workbench.tools import run_tool

    wb, conv = _workbench(task)
    for name, args in prep if prep is not None else task.get("prep", []):
        ctx = wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)
        out = run_tool(ctx, name, args)
        if out.batch is not None:
            wb.add_batch(conv, out.batch)
            wb.accept(conv, out.batch.id)
            if out.batch.status != "accepted":
                raise RuntimeError(f"prep {name} did not apply: {out.batch.gate}")
    return wb, conv


# Synthetic compiler contracts (backend/fixtures/synthetic) for oracle-only tasks.
SYNTHETIC = Path(__file__).resolve().parents[3] / "fixtures" / "synthetic"


def oracle_args(oracle: dict[str, Any]) -> dict[str, Any]:
    args = dict(oracle.get("args", {}))
    if oracle.get("contract_file"):
        args["contract"] = json.loads((SYNTHETIC / oracle["contract_file"])
                                      .read_text(encoding="utf-8"))
    return args


def run_oracle(task: dict[str, Any]) -> dict[str, Any]:
    """The deterministic proof of a task's golden: returns the oracle tool output."""
    from litchai.workbench.tools import run_tool

    oracle = task["oracle"]
    wb, conv = prepare(task, oracle.get("prep", task.get("prep", [])))
    ctx = wb.context(conv, taxonomy=_taxonomy(), categoriser=scripted_categoriser)
    return run_tool(ctx, oracle["tool"], oracle_args(oracle)).data


def verify_task(task: dict[str, Any]) -> list[str]:
    data = run_oracle(task)
    return [f"{task['id']}: {c}" for c in task.get("checks", [])
            if not check_value(data, c)]


@dataclass
class TaskScore:
    id: str
    category: str
    provider: str
    tools_ok: bool = False
    values_ok: bool = False
    answer_ok: bool = False
    passed: bool = False
    steps: int = 0
    retries: int = 0
    fallbacks: int = 0
    provider_used: str | None = None
    tools_called: list[str] = field(default_factory=list)
    seconds: float = 0.0
    answer: str = ""
    error: str | None = None
    degraded: bool = False


def score_events(task: dict[str, Any], events: list[dict[str, Any]], provider: str,
                 seconds: float = 0.0) -> TaskScore:
    s = TaskScore(task["id"], task["category"], provider, seconds=round(seconds, 2))
    results = [e for e in events if e["type"] == "tool_result"]
    s.tools_called = [e["tool"] for e in results]
    s.retries = sum(1 for e in events if e["type"] == "retry")
    s.fallbacks = sum(1 for e in events if e["type"] == "fallback")
    s.provider_used = next((e["provider"] for e in events if e["type"] == "provider"), None)
    final = next((e for e in reversed(events) if e["type"] in ("final", "error")), {})
    s.steps = int(final.get("steps") or len(results))
    s.degraded = bool(final.get("degraded"))
    s.answer = (final.get("answer") or final.get("message") or "")[:1500]
    if final.get("type") == "error":
        s.error = final.get("message")
    expect = set(task.get("expect_tools", []))
    ok_results = [e for e in results if e.get("ok")]
    s.tools_ok = not expect or any(e["tool"] in expect for e in ok_results)
    default_tool = task["oracle"]["tool"]

    def holds(check: dict[str, Any]) -> bool:
        tool = check.get("tool", default_tool)
        return any(check_value(e.get("data") or {}, check) for e in ok_results
                   if e["tool"] == tool)

    s.values_ok = all(holds(c) for c in task.get("checks", []))
    s.answer_ok = all(states_figure(s.answer, float(f)) for f in task.get("answer", [])) and \
        not any(states_figure(s.answer, float(f)) for f in task.get("answer_excludes", []))
    if task.get("cite_any"):
        cited = {c for e in events if e["type"] == "final" for c in e.get("citations", [])}
        cited_text = s.answer + " " + " ".join(cited)
        s.answer_ok = s.answer_ok and any(ref.split("!")[1] in cited_text
                                          for ref in task["cite_any"])
    s.passed = s.tools_ok and s.values_ok and s.answer_ok and s.error is None
    return s


def router_for(provider: str, router: Any = None) -> Any:
    from litchai.ai.router import ProviderRouter, default_specs

    if router is not None:
        return router
    if provider == "none":
        return ProviderRouter([])
    # "groq" means the Groq model family (each model has its own daily quota);
    # "groq:gpt-oss-20b" picks one model.
    specs = [s for s in default_specs()
             if s.name == provider or (":" not in provider and s.name.startswith(provider + ":"))]
    if not specs:
        raise SystemExit(f"unknown provider {provider!r}")
    if not specs[0].configured:
        raise SystemExit(f"provider {provider!r} has no key configured")
    # The same persisted quota as the app (ai_provider_quota), so an eval run knows
    # which models are already out for today; in-memory when there is no database.
    from litchai.ai.pg import ConnectingQuota

    return ProviderRouter(specs, quota=ConnectingQuota())


def run_task(task: dict[str, Any], provider: str, router: Any = None) -> TaskScore:
    from litchai.workbench.engine import TurnDeps, run_turn

    wb, conv = prepare(task)
    if provider == "local":
        conv.ai_mode = "local_only"
    deps = TurnDeps(wb, router_for(provider, router), taxonomy=_taxonomy(),
                    categoriser=scripted_categoriser)
    t0 = time.monotonic()
    try:
        events = list(run_turn(deps, conv, task["prompt"]))
    except Exception as exc:  # noqa: BLE001 — one broken task must not stop the run
        s = TaskScore(task["id"], task["category"], provider, error=f"{type(exc).__name__}: "
                      f"{exc}"[:300])
        return s
    return score_events(task, events, provider, time.monotonic() - t0)


def summarise(scores: list[TaskScore]) -> dict[str, Any]:
    by: dict[str, dict[str, Any]] = {}
    for s in scores:
        p = by.setdefault(s.provider, {"tasks": 0, "passed": 0, "tools_ok": 0, "values_ok": 0,
                                       "answer_ok": 0, "retries": 0, "fallbacks": 0,
                                       "seconds": 0.0, "steps": 0, "errors": 0,
                                       "by_category": {}})
        p["tasks"] += 1
        for k in ("passed", "tools_ok", "values_ok", "answer_ok"):
            p[k] += int(getattr(s, k))
        p["retries"] += s.retries
        p["fallbacks"] += s.fallbacks
        p["seconds"] += s.seconds
        p["steps"] += s.steps
        p["errors"] += int(s.error is not None)
        cat = p["by_category"].setdefault(s.category, [0, 0])
        cat[0] += int(s.passed)
        cat[1] += 1
    for p in by.values():
        n = max(1, p["tasks"])
        p["pass_rate"] = round(p["passed"] / n, 3)
        p["avg_seconds"] = round(p["seconds"] / n, 2)
        p["avg_steps"] = round(p["steps"] / n, 2)
    return by


def markdown(summary: dict[str, Any]) -> str:
    lines = [("| provider | pass | tools | values | answer | avg steps | avg s | retries | "
             "fallbacks | errors |"), "|---|---|---|---|---|---|---|---|---|---|"]
    for name, p in summary.items():
        n = p["tasks"]
        lines.append(f"| {name} | {p['passed']}/{n} | {p['tools_ok']} | {p['values_ok']} | "
                     f"{p['answer_ok']} | {p['avg_steps']} | {p['avg_seconds']} | "
                     f"{p['retries']} | {p['fallbacks']} | {p['errors']} |")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--provider", action="append", default=[],
                    help="groq | cloudflare | sambanova | openrouter | cerebras | local | chat | none (repeatable)")
    ap.add_argument("--verify", action="store_true", help="run the oracles only (offline)")
    ap.add_argument("--task", action="append", default=[], help="task id (repeatable)")
    ap.add_argument("--category", action="append", default=[])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=0.0, help="seconds between tasks (rate limits)")
    ap.add_argument("--out", help="write the full JSON report here")
    args = ap.parse_args(argv)

    tasks = load_tasks()["tasks"]
    if args.task:
        tasks = [t for t in tasks if t["id"] in set(args.task)]
    if args.category:
        tasks = [t for t in tasks if t["category"] in set(args.category)]
    if args.limit:
        tasks = tasks[: args.limit]

    if args.verify or not args.provider:
        failures = [f for t in tasks for f in verify_task(t)]
        print(f"{len(tasks)} oracles, {len(failures)} failing")
        for f in failures:
            print("  FAIL", f)
        return 1 if failures else 0

    # Oracle-only tasks (inputs a chat prompt cannot carry) are proven offline only.
    tasks = [t for t in tasks if not t.get("oracle_only")]
    scores: list[TaskScore] = []
    for provider in args.provider:
        for i, task in enumerate(tasks):
            s = run_task(task, provider)
            scores.append(s)
            mark = "PASS" if s.passed else "fail"
            print(f"[{provider}] {i + 1}/{len(tasks)} {mark} {task['id']} "
                  f"(tools {int(s.tools_ok)} values {int(s.values_ok)} answer {int(s.answer_ok)}"
                  f", {s.seconds}s{', ' + s.error if s.error else ''})", flush=True)
            if args.sleep:
                time.sleep(args.sleep)
    summary = summarise(scores)
    print()
    print(markdown(summary))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump({"version": load_tasks()["version"], "summary": summary,
                       "tasks": [asdict(s) for s in scores]}, fh, indent=2, default=str)
        print(f"\nreport: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Local-model bench for the VM (Phase 3.2): llama-server vs Ollama (vs cloud).

Measures, per target and workload, over ``--runs`` repetitions:

* ttft_s       time to first streamed token
* prompt_tps   prompt processing speed (tokens/s), from the server's own timings
* decode_tps   generation speed (tokens/s)
* total_s      wall time of a full (non-streamed) completion
* valid        share of agent-turn replies that parse and validate as a workbench
               step (the same check the harness applies)
* rss_mb       memory of the serving unit after the run (systemd MemoryCurrent)

Workloads: ``short`` (a categorisation-sized prompt), ``workbench`` (the real
workbench agent prompt over the fixture ledger, about 1.3k tokens; a few tool
results and history grow a real turn to 4-6k) and ``agent_turn`` (that prompt
answered with one schema-checked JSON step).

    python -m litchai.ops.llm_bench \\
        --target llama,openai,http://127.0.0.1:8081/v1,qwen3-4b-q4_k_m,litchai-llama \\
        --target ollama,ollama,http://127.0.0.1:11434,gemma3:4b,ollama \\
        --runs 3 --out /tmp/llm-bench.json

A target is ``name,api,base_url,model[,systemd_unit]`` where api is ``openai``
(llama-server, any OpenAI-compatible server) or ``ollama``. Run it when the box
is otherwise quiet; both servers serve one request at a time.
"""
from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from typing import Any

SHORT_PROMPT = (
    "Classify this Nigerian bank statement narration into one ledger category code. "
    "Reply with the code only.\nNarration: POS PURCHASE SHOPRITE LEKKI 23/03\n"
    "Codes: admin.office_supplies, admin.staff_welfare, cos.purchases, transfers.internal"
)


@dataclass(frozen=True)
class Target:
    name: str
    api: str
    base_url: str
    model: str
    unit: str | None = None

    @classmethod
    def parse(cls, raw: str) -> Target:
        parts = [p.strip() for p in raw.split(",")]
        if len(parts) not in (4, 5) or parts[1] not in ("openai", "ollama"):
            raise SystemExit(f"bad --target {raw!r}: want name,openai|ollama,base_url,model[,unit]")
        return cls(parts[0], parts[1], parts[2].rstrip("/"), parts[3],
                   parts[4] if len(parts) == 5 else None)


@dataclass
class Sample:
    ttft_s: float | None = None
    prompt_tokens: int | None = None
    prompt_tps: float | None = None
    decode_tokens: int | None = None
    decode_tps: float | None = None
    total_s: float | None = None
    valid: bool | None = None
    error: str | None = None


@dataclass
class Result:
    target: str
    workload: str
    runs: int
    samples: list[Sample] = field(default_factory=list)
    rss_mb: float | None = None

    def summary(self) -> dict[str, Any]:
        def med(attr: str) -> float | None:
            vals = [getattr(s, attr) for s in self.samples if getattr(s, attr) is not None]
            return round(statistics.median(vals), 2) if vals else None

        valid = [s.valid for s in self.samples if s.valid is not None]
        return {
            "target": self.target, "workload": self.workload, "runs": self.runs,
            "errors": sum(1 for s in self.samples if s.error),
            "ttft_s": med("ttft_s"), "prompt_tokens": med("prompt_tokens"),
            "prompt_tps": med("prompt_tps"), "decode_tps": med("decode_tps"),
            "total_s": med("total_s"),
            "valid": round(sum(valid) / len(valid), 2) if valid else None,
            "rss_mb": self.rss_mb,
        }


# --- prompts ----------------------------------------------------------------------
def workbench_messages() -> list[dict[str, str]]:
    """The real agent system prompt over the fixture ledger + bank workbook."""
    from litchai.ai.decision import HeuristicDecisionLayer
    from litchai.ai.harness import AgentTool, _tool_menu
    from litchai.ai.tasks import PROMPTS_DIR
    from litchai.evals.fixtures import ledger_bank_xlsx
    from litchai.workbench.context import ToolContext
    from litchai.workbench.model import load_xlsx
    from litchai.workbench.profile import profile_text, profile_workbook
    from litchai.workbench.tools import TOOLS, TOOLS_BY_NAME, catalog_text

    wb = load_xlsx(ledger_bank_xlsx(), wb_id="doc-1", name="ledger.xlsx")
    ctx = ToolContext({"doc-1": wb})
    message = "Reconcile the bank statement to the ledger and tell me the difference."
    names = HeuristicDecisionLayer().select_tools(message, list(TOOLS))
    tools = [AgentTool(t.name, t.description, t.schema(), t.kind)
             for t in (TOOLS_BY_NAME[n] for n in names)]
    template = (PROMPTS_DIR / "workbench_agent.md").read_text(encoding="utf-8")
    system = template.format(profile=profile_text(profile_workbook(wb, 3)),
                             sql_catalog=catalog_text(ctx), pending="(none)", max_steps=8,
                             tool_menu="{tool_menu}").replace("{tool_menu}", _tool_menu(tools))
    return [{"role": "system", "content": system}, {"role": "user", "content": message}]


def _valid_turn(text: str) -> bool:
    from litchai.ai.harness import parse_turn
    from litchai.workbench.tools import TOOLS_BY_NAME

    turn, err = parse_turn(text, set(TOOLS_BY_NAME))
    return turn is not None and err is None


# --- one call ---------------------------------------------------------------------
def _body(t: Target, messages: list[dict[str, str]], max_tokens: int, stream: bool,
          schema: dict[str, Any] | None) -> tuple[str, dict[str, Any]]:
    if t.api == "ollama":
        body: dict[str, Any] = {"model": t.model, "messages": messages, "stream": stream,
                                "options": {"temperature": 0, "num_ctx": 8192,
                                            "num_predict": max_tokens}}
        if schema is not None:
            body["format"] = schema
        return f"{t.base_url}/api/chat", body
    body = {"model": t.model, "messages": messages, "stream": stream, "temperature": 0,
            "max_tokens": max_tokens}
    if schema is not None:
        body["response_format"] = {"type": "json_object"}
    return f"{t.base_url}/chat/completions", body


def measure(t: Target, messages: list[dict[str, str]], *, max_tokens: int,
            schema: dict[str, Any] | None = None, timeout: float = 600.0) -> Sample:
    import httpx

    s = Sample()
    try:
        # Streamed pass → time to first token.
        url, body = _body(t, messages, max_tokens=8, stream=True, schema=None)
        t0 = time.monotonic()
        with httpx.stream("POST", url, json=body, timeout=timeout) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                line = line.strip()
                if not line or line == "data: [DONE]":
                    continue
                payload = json.loads(line.removeprefix("data: "))
                piece = ((payload.get("message") or {}).get("content") if t.api == "ollama"
                         else ((payload.get("choices") or [{}])[0].get("delta") or {})
                         .get("content"))
                if piece:
                    s.ttft_s = round(time.monotonic() - t0, 3)
                    break
        # Full pass → throughput and validity.
        url, body = _body(t, messages, max_tokens=max_tokens, stream=False, schema=schema)
        t0 = time.monotonic()
        resp = httpx.post(url, json=body, timeout=timeout)
        resp.raise_for_status()
        s.total_s = round(time.monotonic() - t0, 3)
        data = resp.json()
        if t.api == "ollama":
            text = (data.get("message") or {}).get("content", "")
            s.prompt_tokens, s.decode_tokens = data.get("prompt_eval_count"), data.get("eval_count")
            pd, ed = data.get("prompt_eval_duration"), data.get("eval_duration")
            if s.prompt_tokens and pd:
                s.prompt_tps = round(s.prompt_tokens / (pd / 1e9), 1)
            if s.decode_tokens and ed:
                s.decode_tps = round(s.decode_tokens / (ed / 1e9), 1)
        else:
            text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
            usage, timings = data.get("usage") or {}, data.get("timings") or {}
            s.prompt_tokens = usage.get("prompt_tokens") or timings.get("prompt_n")
            s.decode_tokens = usage.get("completion_tokens") or timings.get("predicted_n")
            s.prompt_tps = (round(timings["prompt_per_second"], 1)
                            if timings.get("prompt_per_second") else None)
            s.decode_tps = (round(timings["predicted_per_second"], 1)
                            if timings.get("predicted_per_second") else None)
            if s.decode_tps is None and s.decode_tokens and s.total_s:
                s.decode_tps = round(s.decode_tokens / s.total_s, 1)  # lower bound
        if schema is not None:
            s.valid = _valid_turn(text)
    except Exception as exc:  # noqa: BLE001 — record and move on
        s.error = f"{type(exc).__name__}: {exc}"[:200]
    return s


def unit_memory_mb(unit: str | None) -> float | None:
    if not unit:
        return None
    try:
        out = subprocess.run(["systemctl", "show", "-p", "MemoryCurrent", "--value", unit],
                             capture_output=True, text=True, timeout=10, check=False).stdout.strip()
        return round(int(out) / 2**20, 1) if out.isdigit() else None
    except (OSError, subprocess.SubprocessError):
        return None


def run(targets: list[Target], workloads: list[str], runs: int) -> list[Result]:
    from litchai.ai.harness import AGENT_TURN_SCHEMA

    wb_msgs = workbench_messages() if {"workbench", "agent_turn"} & set(workloads) else []
    plan = {
        "short": ([{"role": "user", "content": SHORT_PROMPT}], 16, None),
        "workbench": (wb_msgs, 64, None),
        "agent_turn": (wb_msgs, 400, AGENT_TURN_SCHEMA),
    }
    results = []
    for t in targets:
        for w in workloads:
            messages, max_tokens, schema = plan[w]
            r = Result(t.name, w, runs)
            # One untimed warm-up so a cold model load doesn't count as latency.
            measure(t, messages[:1] + [{"role": "user", "content": "ok"}], max_tokens=1)
            for i in range(runs):
                s = measure(t, messages, max_tokens=max_tokens, schema=schema)
                r.samples.append(s)
                print(f"[{t.name}/{w}] run {i + 1}/{runs}: "
                      + (s.error or f"ttft {s.ttft_s}s, prompt {s.prompt_tps} t/s, "
                         f"decode {s.decode_tps} t/s, total {s.total_s}s"
                         + (f", valid {s.valid}" if s.valid is not None else "")), flush=True)
            r.rss_mb = unit_memory_mb(t.unit)
            results.append(r)
    return results


def markdown(results: list[Result]) -> str:
    rows = [("| target | workload | prompt tok | ttft s | prompt t/s | decode t/s | total s | "
            "valid | mem MB | errors |"), "|---|---|---|---|---|---|---|---|---|---|"]
    for r in results:
        s = r.summary()
        rows.append(f"| {s['target']} | {s['workload']} | {s['prompt_tokens']} | {s['ttft_s']} | "
                    f"{s['prompt_tps']} | {s['decode_tps']} | {s['total_s']} | {s['valid']} | "
                    f"{s['rss_mb']} | {s['errors']} |")
    return "\n".join(rows)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Bench local model servers on the VM.")
    ap.add_argument("--target", action="append", required=True,
                    help="name,openai|ollama,base_url,model[,systemd_unit] (repeatable)")
    ap.add_argument("--workload", action="append", choices=["short", "workbench", "agent_turn"],
                    help="default: all three")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--out", help="write the JSON report here")
    args = ap.parse_args(argv)
    targets = [Target.parse(t) for t in args.target]
    workloads = args.workload or ["short", "workbench", "agent_turn"]
    results = run(targets, workloads, max(1, args.runs))
    print()
    print(markdown(results))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump({"targets": [asdict(t) for t in targets],
                       "summary": [r.summary() for r in results],
                       "samples": {f"{r.target}/{r.workload}": [asdict(s) for s in r.samples]
                                   for r in results}}, fh, indent=2)
        print(f"\nreport: {args.out}")
    return 0 if all(not any(s.error for s in r.samples) for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())

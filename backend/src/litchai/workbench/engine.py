"""One workbench turn: decision layer → agent loop → tools → proposals.

``run_turn`` streams the harness events for a user message over the whole
conversation (no selection needed; an optional selection is only a hint),
records every write as a pending batch on the conversation, gates risky writes,
and stores the user/assistant messages. ``first_look`` is the deterministic
"Sage reads first" card shown when files are opened — no model involved.
"""
from __future__ import annotations

import json
import re
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from litchai.ai.decision import (
    DecisionLayer,
    HeuristicDecisionLayer,
    fallback_plan,
    gate_batch,
    routing_hints,
)
from litchai.ai.harness import (
    CONFIDENT_TOOLS,
    MAX_OFFERED_TOOLS,
    AgentTool,
    Observation,
    run_agent_loop,
)
from litchai.ai.privacy import Masker
from litchai.ai.tasks import PROMPTS_DIR
from litchai.workbench.context import ToolContext, ToolError
from litchai.workbench.model import parse_range, split_qualified
from litchai.workbench.profile import profile_text, profile_workbook
from litchai.workbench.session import Conversation, Workbench
from litchai.workbench.tools import TOOLS, TOOLS_BY_NAME, catalog_text, run_tool, validate_call

_CITE = re.compile(
    r"^(?:'(?:[^']|'')+'|[^!\s]+)!\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?$")


def _now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class TurnDeps:
    workbench: Workbench
    router: Any                          # litchai.ai.router.ProviderRouter
    taxonomy: Any = None
    categoriser: Any = None
    decision: DecisionLayer | None = None


def _masker_for(conv: Conversation, ctx: ToolContext) -> Masker:
    m = Masker.from_state(conv.mask_state)
    names = {conv.client_name} if conv.client_name and conv.client_name != "Client" else set()
    for wb in ctx.workbooks.values():
        from litchai.workbench.tables import detect_table

        for sheet in wb.sheets.values():
            t = detect_table(sheet)
            if t is None:
                continue
            for col in t.columns:
                if col.role == "counterparty" or "name" in col.name.lower():
                    for r in range(t.first_row, min(t.last_row, t.first_row + 500) + 1):
                        v = sheet.value(r, col.index)
                        if isinstance(v, str) and len(v.strip()) >= 3:
                            names.add(v.strip())
    m.register_names(names)
    return m


def citation_checker(ctx: ToolContext):
    def ok(ref: str) -> bool:
        if not _CITE.match(ref.strip()):
            return False
        sheet, rng = split_qualified(ref.strip())
        try:
            parse_range(rng)
        except Exception:  # noqa: BLE001
            return False
        return any(sheet in wb.sheets or (sheet or "").lower() in
                   {s.lower() for s in wb.sheets} for wb in ctx.workbooks.values())
    return ok


def compact_data(value: Any, max_items: int = 20, max_str: int = 300, depth: int = 0) -> Any:
    """What the model sees of a tool result: long lists cut to their first rows
    (with a count of the rest), long strings cut. The full result stays on the VM
    (grounding, "$tool.path" references and the UI use it)."""
    if depth > 6:
        return "…"
    if isinstance(value, dict):
        return {k: compact_data(v, max_items, max_str, depth + 1) for k, v in value.items()}
    if isinstance(value, list):
        head = [compact_data(v, max_items, max_str, depth + 1) for v in value[:max_items]]
        if len(value) > max_items:
            head.append(f"… {len(value) - max_items} more not shown")
        return head
    if isinstance(value, str) and len(value) > max_str:
        return value[:max_str] + "…"
    return value


def _observation(out: Any, batch_info: dict[str, Any] | None) -> Observation:
    data = out.data
    text = json.dumps({"summary": out.summary, "data": compact_data(data),
                       "citations": out.citations[:20], "proposal": batch_info}, default=str)
    return Observation(ok=True, text=text, summary=out.summary, citations=out.citations,
                       proposal=batch_info, data=_trim(data))


_REF = re.compile(r"^\$([a-z_]+)\.([A-Za-z0-9_.]+)$")


def resolve_refs(value: Any, results: dict[str, Any]) -> Any:
    """Replace "$tool.path" strings with the value from that tool's latest result,
    so a chained step uses the computed figure, never one the model retyped."""
    if isinstance(value, dict):
        return {k: resolve_refs(v, results) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_refs(v, results) for v in value]
    if isinstance(value, str):
        m = _REF.match(value.strip())
        if m:
            tool, path = m.group(1), m.group(2)
            if tool not in results:
                raise ToolError(f"{value}: {tool} has not run yet in this answer")
            cur: Any = results[tool]
            for part in path.split("."):
                if isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
                    cur = cur[int(part)]
                elif isinstance(cur, dict) and part in cur:
                    cur = cur[part]
                else:
                    raise ToolError(f"{value}: no '{part}' in the {tool} result")
            return cur
    return value


def _trim(data: dict[str, Any], limit: int = 12000) -> dict[str, Any]:
    raw = json.dumps(data, default=str)
    if len(raw) <= limit:
        return json.loads(raw)
    return {"truncated": True, "keys": list(data)[:30]}


def run_turn(deps: TurnDeps, conv: Conversation, message: str, *,
             selection: str | None = None, max_steps: int = 8) -> Iterator[dict[str, Any]]:
    wbench = deps.workbench
    decision = deps.decision or HeuristicDecisionLayer()
    ctx = wbench.context(conv, taxonomy=deps.taxonomy, categoriser=deps.categoriser)
    masker = _masker_for(conv, ctx)
    route = decision.decide("tool_route", message, [t.name for t in TOOLS])
    confident = route.confidence >= CONFIDENT_ROUTE
    offered = decision.select_tools(message, list(TOOLS),
                                    k=CONFIDENT_TOOLS if confident else MAX_OFFERED_TOOLS)
    tools = [AgentTool(t.name, t.description, t.schema(), t.kind)
             for t in (TOOLS_BY_NAME[n] for n in offered)]
    conv.messages.append({"role": "user", "content": message, "at": _now(),
                          "selection": selection})

    results: dict[str, Any] = {}  # tool name → its latest data, for "$tool.path" references

    def execute(name: str, args: dict[str, Any], step: int) -> Observation:
        try:
            args = resolve_refs(args, results)
            out = run_tool(ctx, name, args)
            results[name] = out.data
        except ToolError as exc:
            return Observation(ok=False, text=json.dumps({"error": str(exc)}), error=str(exc),
                               summary=f"{name} failed")
        except Exception as exc:  # noqa: BLE001 — a tool bug must not kill the turn
            return Observation(ok=False, text=json.dumps({"error": type(exc).__name__}),
                               error=f"{type(exc).__name__}: {exc}"[:300],
                               summary=f"{name} failed")
        info = None
        if out.batch is not None:
            wbench.add_batch(conv, out.batch, step)
            gate = gate_batch(decision, out.batch)
            info = {"id": out.batch.id, "title": out.batch.title, "summary": out.batch.summary,
                    "counts": out.batch.counts(), "risk": gate.choice,
                    "risk_reasons": gate.reasons}
        obs = _observation(out, info)
        if out.chart_preview is not None:
            obs.data = {**(obs.data or {}), "chart_preview": out.chart_preview}
        return obs

    def check_args(name: str, args: dict[str, Any]) -> str | None:
        try:
            validate_call(name, resolve_refs(args, results))
        except ToolError as exc:
            return str(exc)
        return None

    fast = _fast_path(message, route, ctx, execute) if not selection else None
    if fast is not None:
        for ev in fast:
            yield ev
        _finish(wbench, conv, masker, fast)
        return

    pending = [f"- {b.id}: {b.title} ({b.summary})" for b in conv.batches
               if b.status == "pending"]
    template = (PROMPTS_DIR / "workbench_agent.md").read_text(encoding="utf-8")
    profiles = "\n".join(profile_text(profile_workbook(wb, 3)) for wb in ctx.workbooks.values())
    system = template.format(profile=profiles or "(no workbook yet)",
                             sql_catalog=catalog_text(ctx) or "(none)",
                             pending="\n".join(pending) or "(none)", max_steps=max_steps,
                             tool_menu="{tool_menu}")
    user = message if not selection else f"{message}\n(Selection hint: {selection})"
    hints = routing_hints(message)
    if hints:
        user += "\n(Routing notes from the decision layer: " + " ".join(hints) + ")"
    history = [{"role": m["role"], "content": m["content"]} for m in conv.messages[:-1]
               if m.get("role") in ("user", "assistant")]
    events: list[dict[str, Any]] = []
    for ev in run_agent_loop(system=system, user=user, tools=tools, execute=execute,
                             router=deps.router, history=history, conversation_id=conv.id,
                             local_only=conv.local_only, masker=masker, max_steps=max_steps,
                             check_args=check_args, check_citation=citation_checker(ctx),
                             fallback_plan=fallback_plan, max_tools=len(tools)):
        if ev["type"] == "provider":
            conv.provider = ev["provider"]
        events.append(ev)
        yield ev
    _finish(wbench, conv, masker, events)


def _finish(wbench: Workbench, conv: Conversation, masker: Masker,
            events: list[dict[str, Any]]) -> None:
    final = next((e for e in reversed(events) if e["type"] in ("final", "error")), None)
    events = [{k: v for k, v in e.items() if k != "data"} for e in events]
    conv.mask_state = masker.to_state()
    conv.messages.append({
        "role": "assistant", "at": _now(),
        "content": (final or {}).get("answer") or (final or {}).get("message") or "",
        "citations": (final or {}).get("citations", []),
        "proposals": [p["id"] for p in (final or {}).get("proposals", [])],
        "attribution": (final or {}).get("attribution"),
        "unverified_figures": (final or {}).get("unverified_figures") or [],
        "steps": [e for e in events if e["type"] in ("plan", "tool_call", "tool_result",
                                                      "fallback", "provider", "retry")][:60],
    })
    wbench.store.save(conv)


CONFIDENT_ROUTE = 0.8   # tool_route confidence that offers 5 tools instead of 8
_OVERVIEW = re.compile(
    r"^\s*(?:what(?:'s| is| are)? (?:in|on)|what sheets|which sheets|list the sheets|"
    r"describe|give me an overview of|overview of|summari[sz]e)\b.{0,40}"
    r"\b(?:workbook|file|files|spreadsheet|sheets?)\s*\??\s*$", re.IGNORECASE)


def _fast_path(message: str, route: Any, ctx: ToolContext, execute: Any
               ) -> list[dict[str, Any]] | None:
    """Zero-token path for a simple, high-confidence read ("what is in this
    workbook?"): the pipeline answers from the profile, with no model call."""
    if not ctx.workbooks or route.choice != "profile_workbook" or route.confidence < 0.6:
        return None
    if not _OVERVIEW.match(message) or routing_hints(message):
        return None
    obs = execute("profile_workbook", {}, 1)
    if not obs.ok:
        return None
    return [
        {"type": "start", "tools": ["profile_workbook"], "max_steps": 1, "fast_path": True},
        {"type": "tool_call", "step": 1, "tool": "profile_workbook", "args": {},
         "layer": "pipeline"},
        {"type": "tool_result", "step": 1, "tool": "profile_workbook", "ok": True,
         "summary": obs.summary, "error": None, "proposal": None,
         "citations": (obs.citations or [])[:20], "data": obs.data},
        {"type": "final", "answer": "Here is what is in the workbook:\n" + obs.summary,
         "citations": (obs.citations or [])[:40], "dropped_citations": [], "proposals": [],
         "steps": 1, "fast_path": True,
         "attribution": {"pipeline": ["profile_workbook"], "model": None,
                         "decision": "heuristic"}},
    ]


def first_look(deps: TurnDeps, conv: Conversation) -> dict[str, Any]:
    """Deterministic first-look card: per-sheet profile + anomaly counts +
    suggested next actions. No model call."""
    ctx = deps.workbench.context(conv, taxonomy=deps.taxonomy, categoriser=deps.categoriser)
    profiles = [profile_workbook(wb, 3) for wb in ctx.workbooks.values()]
    try:
        anomalies = run_tool(ctx, "flag_anomalies", {}).data
    except ToolError:
        anomalies = {"count": 0, "by_kind": {}, "findings": []}
    suggestions = []
    sheets = [s for p in profiles for s in p["sheets"] if s.get("table")]
    roles = {c.get("role") for s in sheets for c in s.get("columns", [])}
    has_bank = any(any(c.get("role") == "balance" for c in s.get("columns", []))
                   for s in sheets)
    if has_bank and len(sheets) >= 2:
        suggestions.append("Reconcile bank to ledger")
    if "description" in roles and "category" not in roles:
        suggestions.append("Categorise the transactions")
    if "category" in roles:
        suggestions.append("Build the P&L as a new sheet")
    if anomalies.get("by_kind", {}).get("text_date"):
        suggestions.append(f"Fix the {anomalies['by_kind']['text_date']} text dates")
    suggestions.append("Chart monthly totals")
    return {"workbooks": profiles, "anomalies": anomalies, "suggestions": suggestions[:5],
            "layer": "pipeline"}

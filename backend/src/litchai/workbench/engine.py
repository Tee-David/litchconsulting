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
)
from litchai.ai.harness import AgentTool, Observation, run_agent_loop
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


def _observation(out: Any, batch_info: dict[str, Any] | None) -> Observation:
    data = out.data
    text = json.dumps({"summary": out.summary, "data": data, "citations": out.citations[:20],
                       "proposal": batch_info}, default=str)
    return Observation(ok=True, text=text, summary=out.summary, citations=out.citations,
                       proposal=batch_info, data=_trim(data))


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
    offered = decision.select_tools(message, list(TOOLS))
    tools = [AgentTool(t.name, t.description, t.schema(), t.kind)
             for t in (TOOLS_BY_NAME[n] for n in offered)]
    conv.messages.append({"role": "user", "content": message, "at": _now(),
                          "selection": selection})

    def execute(name: str, args: dict[str, Any], step: int) -> Observation:
        try:
            out = run_tool(ctx, name, args)
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
            validate_call(name, args)
        except ToolError as exc:
            return str(exc)
        return None

    pending = [f"- {b.id}: {b.title} ({b.summary})" for b in conv.batches
               if b.status == "pending"]
    template = (PROMPTS_DIR / "workbench_agent.md").read_text(encoding="utf-8")
    profiles = "\n".join(profile_text(profile_workbook(wb, 3)) for wb in ctx.workbooks.values())
    system = template.format(profile=profiles or "(no workbook yet)",
                             sql_catalog=catalog_text(ctx) or "(none)",
                             pending="\n".join(pending) or "(none)", max_steps=max_steps,
                             tool_menu="{tool_menu}")
    user = message if not selection else f"{message}\n(Selection hint: {selection})"
    history = [{"role": m["role"], "content": m["content"]} for m in conv.messages[:-1]
               if m.get("role") in ("user", "assistant")]
    final: dict[str, Any] | None = None
    events: list[dict[str, Any]] = []
    for ev in run_agent_loop(system=system, user=user, tools=tools, execute=execute,
                             router=deps.router, history=history, conversation_id=conv.id,
                             local_only=conv.local_only, masker=masker, max_steps=max_steps,
                             check_args=check_args, check_citation=citation_checker(ctx),
                             fallback_plan=fallback_plan):
        if ev["type"] == "provider":
            conv.provider = ev["provider"]
        if ev["type"] in ("final", "error"):
            final = ev
        events.append({k: v for k, v in ev.items() if k != "data"})
        yield ev
    conv.mask_state = masker.to_state()
    conv.messages.append({
        "role": "assistant", "at": _now(),
        "content": (final or {}).get("answer") or (final or {}).get("message") or "",
        "citations": (final or {}).get("citations", []),
        "proposals": [p["id"] for p in (final or {}).get("proposals", [])],
        "attribution": (final or {}).get("attribution"),
        "steps": [e for e in events if e["type"] in ("plan", "tool_call", "tool_result",
                                                      "fallback", "provider", "retry")][:60],
    })
    wbench.store.save(conv)


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

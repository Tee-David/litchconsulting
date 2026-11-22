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
import time
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


def pop_last_turn(conv: Conversation) -> list[dict[str, Any]]:
    """A5: take the last question and its answer out of the thread, to keep them as an
    earlier branch of the next question (edit and resend, regenerate). Branches the old
    question already had come along, so no version is ever lost."""
    msgs = conv.messages
    if len(msgs) >= 2 and msgs[-1].get("role") == "assistant" and msgs[-2].get("role") == "user":
        user, answer = msgs[-2], msgs[-1]
        del msgs[-2:]
    elif msgs and msgs[-1].get("role") == "user":
        user, answer = msgs[-1], None
        del msgs[-1:]
    else:
        return []
    older = list(user.get("branches") or [])
    plain = {k: v for k, v in user.items() if k != "branches"}
    return [*older, {"user": plain, "assistant": answer}]


# A6: words that point at what the person selected.
_DEICTIC = re.compile(
    r"\b(this|these|those|selected|selection|highlighted|this range|these cells|"
    r"the range|these rows|this column|this row|this table)\b", re.IGNORECASE)


def selection_matters(message: str, selection: str | None) -> bool:
    """A selection counts only when the question points at it ("sum these", "explain
    this"). Otherwise it is just where the cursor is, and is ignored."""
    return bool(selection) and bool(_DEICTIC.search(message or ""))


def selection_preview(ctx: ToolContext, selection: str, *, max_rows: int = 15,
                      max_cols: int = 8) -> str:
    """The selected cells as a small table with references, for the model."""
    sheet_name, rng = split_qualified(selection)
    try:
        r0, c0, r1, c1 = parse_range(rng)
    except Exception:  # noqa: BLE001 - a bad hint is only skipped
        return ""
    for wb in ctx.workbooks.values():
        sh = next((s for n, s in wb.sheets.items()
                   if sheet_name is None or n.lower() == sheet_name.lower()), None)
        if sh is None:
            continue
        from litchai.workbench.model import a1

        lines = []
        for r in range(r0, min(r1, r0 + max_rows - 1) + 1):
            row = []
            for c in range(c0, min(c1, c0 + max_cols - 1) + 1):
                cell = sh.get(r, c)
                v = "" if cell is None else (cell.formula or cell.display)
                row.append(f"{a1(r, c)}={'' if v is None else str(v)[:40]}")
            lines.append(" | ".join(row))
        more = []
        if r1 - r0 + 1 > max_rows:
            more.append(f"{r1 - r0 + 1 - max_rows} more rows")
        if c1 - c0 + 1 > max_cols:
            more.append(f"{c1 - c0 + 1 - max_cols} more columns")
        return "\n".join(lines) + (f"\n({', '.join(more)} not shown)" if more else "")
    return ""


_PASTED_NOTE = re.compile(r"Files I added: [^)]*Pasted text", re.IGNORECASE)
_THIN_ASK = re.compile(r"^\s*(read the files i added\.?|see the pasted text\.?|)\s*$", re.IGNORECASE)


def with_pasted_text(message: str, workbooks: dict[str, Any]) -> str:
    """A question that only points at pasted text (the browser turned a long paste
    into a .txt file) carries that text as the request, so the model reads the
    instructions instead of treating them as data."""
    if not _PASTED_NOTE.search(message):
        return message
    question = message.split("(Files I added:")[0]
    if not _THIN_ASK.match(question.strip()):
        return message
    pasted = [wb for wb in workbooks.values() if str(getattr(wb, "name", "")).lower().startswith("pasted text")]
    if not pasted:
        return message
    wb = pasted[-1]
    lines: list[str] = []
    for sheet in wb.sheets.values():
        rows: dict[int, list[tuple[int, Any]]] = {}
        for (r, c), cell in sheet.cells.items():
            if cell.value not in (None, ""):
                rows.setdefault(r, []).append((c, cell.value))
        for r in sorted(rows):
            lines.append(" ".join(str(v) for _, v in sorted(rows[r])))
    text = "\n".join(lines).strip()
    if not text:
        return message
    return f"{text[:6000]}\n\n(The person pasted these instructions; follow them. {message.strip()})"


def run_turn(deps: TurnDeps, conv: Conversation, message: str, *,
             selection: str | None = None, max_steps: int = 8,
             replace_last: bool = False) -> Iterator[dict[str, Any]]:
    wbench = deps.workbench
    t0 = time.monotonic()
    decision = deps.decision or HeuristicDecisionLayer()
    ctx = wbench.context(conv, taxonomy=deps.taxonomy, categoriser=deps.categoriser)
    masker = _masker_for(conv, ctx)
    ctx.memory["refs"] = conv.workbooks  # the files and their labels, for the recipes
    shown_message = message  # the bubble shows what the person typed
    message = with_pasted_text(message, ctx.workbooks)
    route = decision.decide("tool_route", message, [t.name for t in TOOLS])
    confident = route.confidence >= CONFIDENT_ROUTE
    offered = decision.select_tools(message, list(TOOLS),
                                    k=CONFIDENT_TOOLS if confident else MAX_OFFERED_TOOLS)
    from litchai.workbench.trial_balance import looks_like_tb

    has_tb = looks_like_tb(ctx.workbooks)
    if has_tb and "trial_balance_statements" not in offered:
        # A TB is open: its statements tool goes first, added to the picks (not
        # replacing one: that left a TB analysis request with no sheet tools).
        offered = ["trial_balance_statements", *offered]
    if has_tb and _TB_ANALYSIS.search(message) and "financial_analysis" not in offered:
        offered = ["financial_analysis", "tb_lines", *offered]
    tools = [AgentTool(t.name, t.description, t.schema(), t.kind)
             for t in (TOOLS_BY_NAME[n] for n in offered)]
    branches = pop_last_turn(conv) if replace_last else []
    conv.messages.append({"role": "user", "content": shown_message, "at": _now(),
                          "selection": selection, **({"branches": branches} if branches else {})})

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

    def check_args(name: str, args: dict[str, Any], strict: bool = False) -> str | None:
        try:
            validate_call(name, resolve_refs(args, results), strict=strict)
        except ToolError as exc:
            return str(exc)
        return None

    pointed = selection_matters(message, selection)
    fast = _fast_path(message, route, ctx, execute) if not pointed else None
    if fast is None and has_tb and not pointed:
        fast = _year_end_fast_path(message, ctx, execute, conv)
    if fast is None and has_tb and not pointed:
        fast = _analysis_fast_path(message, ctx, execute)
    if fast is None and has_tb and not pointed:
        fast = _tb_fast_path(message, ctx, execute)
    if fast is not None:
        for ev in fast:
            ev.setdefault("ms", int((time.monotonic() - t0) * 1000))
            if ev["type"] == "final":
                ev["sources_used"] = sources_used(ctx, conv, fast)
            yield ev
        _finish(wbench, conv, masker, fast)
        return

    pending = [f"- {b.id}: {b.title} ({b.summary})" for b in conv.batches
               if b.status == "pending"]
    template = (PROMPTS_DIR / "workbench_agent.md").read_text(encoding="utf-8")
    profiles = "\n".join(profile_text(profile_workbook(wb, 3)) for wb in ctx.workbooks.values())
    if len(conv.workbooks) > 1:
        # Several files: one line each first (what it is, what it is for), so the model
        # picks the right file by name or purpose.
        from litchai.workbench.file_context import manifest

        profiles = ("Files in this job (id, name, what it is, period, rows, note):\n"
                    + manifest(conv.workbooks, ctx.workbooks) + "\n\n" + profiles)
    system = template.format(profile=profiles or "(no workbook yet)",
                             sql_catalog=catalog_text(ctx) or "(none)",
                             pending="\n".join(pending) or "(none)", max_steps=max_steps,
                             tool_menu="{tool_menu}")
    user = message
    named = mentioned(conv, message)
    if named:
        # v8: "@GTBank statement" or files chosen in the Sources panel
        user += ("\n(The person points to these files: " + "; ".join(
            f"{r.name} (workbook {r.id})" for r in named) + ". Use them for this request.)")
    if pointed and selection:
        preview = selection_preview(ctx, selection)
        user += (f"\n(The person selected {selection}. \"This\", \"these\" or \"selected\" means "
                 f"exactly that range. Its cells:\n{preview})" if preview else
                 f"\n(The person selected {selection}. \"This\" or \"these\" means that range.)")
    elif selection:
        user += f"\n(The cursor is on {selection}. Use it only if the question needs it.)"
    if conv.instructions.strip():
        # A7: standing instructions from the firm for this workbench.
        system += ("\n\nStanding instructions for this workbench (follow them in every answer "
                   "unless the person says otherwise in this message):\n" + conv.instructions.strip())
    hints = routing_hints(message)
    if has_tb and _TB_INTENT.search(_TB_NAME.sub(" ", message)):
        hints = [("This workbook has a trial balance: use trial_balance_statements for "
                 "profit, P&L, balance sheet and balancing questions, then tax_compute "
                 "kind=cit (it takes the PBT from the TB). Use financial_analysis for "
                 "ratios, margins, liquidity and solvency, and tb_lines to find the exact "
                 "TB cell of an account before you write a formula.")]
    if hints:
        user += "\n(Routing notes from the decision layer: " + " ".join(hints) + ")"
    history = [{"role": m["role"], "content": m["content"]} for m in conv.messages[:-1]
               if m.get("role") in ("user", "assistant")]
    events: list[dict[str, Any]] = []
    used = {"input_tokens": 0, "output_tokens": 0, "calls": 0}
    # v8: a "check / what is wrong / reconcile" request runs the standard checks that fit
    # the files first (no model), and the model starts from their findings (edge-case run
    # 22 Nov: the model ran its own SQL and missed every settlement problem).
    pre_events: list[dict[str, Any]] = []
    if _CHECK_INTENT.search(message) and not pointed:
        found: list[str] = []
        for k, name in enumerate([t for t in _job_checks(ctx, conv)
                                  if (t != "review_points" or has_tb) and t != "flag_anomalies"],
                                 start=90):
            call_ev = {"type": "tool_call", "step": k, "tool": name, "args": {},
                       "layer": "pipeline"}
            obs = execute(name, {}, k)
            res_ev = {"type": "tool_result", "step": k, "tool": name, "ok": obs.ok,
                      "summary": obs.summary, "error": obs.error, "proposal": obs.proposal,
                      "citations": (obs.citations or [])[:20], "data": obs.data}
            pre_events += [call_ev, res_ev]  # sent right after the "start" event
            if obs.ok and obs.summary and not obs.summary.startswith("No "):
                found.append(obs.summary)
        if found:
            user += ("\n(The standard checks already ran and found:\n" + "\n".join(found)[:1200]
                     + "\nStart your answer from these findings. Do not run these checks "
                     "again.)")
    if hasattr(deps.router, "pin"):
        # Each turn starts on the chosen model, else on the firm's default (the head
        # of the chain). A fallback in one turn must not move later turns to Groq.
        if conv.model and not conv.local_only:
            deps.router.pin(conv.id, conv.model)
        elif hasattr(deps.router, "unpin"):
            deps.router.unpin(conv.id)
    for ev in run_agent_loop(system=system, user=user, tools=tools, execute=execute,
                             router=deps.router, history=history, conversation_id=conv.id,
                             local_only=conv.local_only, masker=masker, max_steps=max_steps,
                             check_args=check_args, check_citation=citation_checker(ctx),
                             fallback_plan=lambda _m, _p=_plan_for(has_tb, _job_checks(ctx, conv)): _p(message),
                             max_tools=len(tools),
                             more_tools=[AgentTool(t.name, t.description, t.schema(), t.kind)
                                         for t in TOOLS if t.name not in offered]):
        if ev["type"] == "start" and pre_events:
            events.append(ev)
            yield ev
            for pe in pre_events:
                pe.setdefault("ms", int((time.monotonic() - t0) * 1000))
                events.append(pe)
                yield pe
            continue
        if ev["type"] == "provider":
            conv.provider = ev["provider"]
        if ev["type"] == "usage":
            for k in ("input_tokens", "output_tokens"):
                used[k] += ev.get(k) or 0
            used["calls"] += 1
            continue  # kept as a total on the answer, not as a step
        if ev["type"] in ("final", "error"):
            ev["tokens"] = dict(used)
        if ev["type"] == "final":
            ev["sources_used"] = sources_used(ctx, conv, events)
        # Elapsed time, so the page can say "Worked in 4 steps · 6 s".
        ev.setdefault("ms", int((time.monotonic() - t0) * 1000))
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
        "ms": (final or {}).get("ms"),
        "tokens": (final or {}).get("tokens"),
        "sources_used": (final or {}).get("sources_used") or [],
        "steps": [e for e in events if e["type"] in ("plan", "tool_call", "tool_result",
                                                      "fallback", "provider", "retry")][:60],
    })
    wbench.store.save(conv)


_CHECK_INTENT = re.compile(
    r"\b(check|checks|wrong|review|audit|reconcil\w*|look(s|ing)? (off|wrong)|problems?|issues?|"
    r"mistakes?|errors?|fraud|suspicious|owe[sd]?|agree|tally|mess)\b", re.IGNORECASE)
_MENTION = re.compile(r"@\[([^\]]{1,160})\]|@([\w.\-]{3,80})")


def mentioned(conv: Conversation, message: str) -> list[Any]:
    """Files named with @ in the message: @[GTBank statement.csv] or @GTBank_statement."""
    names = [a or b for a, b in _MENTION.findall(message or "")]
    if not names:
        return []
    out = []
    for n in names:
        low = n.lower().strip()
        ref = next((r for r in conv.workbooks if r.name.lower() == low), None) or next(
            (r for r in conv.workbooks if r.name.lower().startswith(low)), None)
        if ref is not None and ref not in out:
            out.append(ref)
    return out


def sources_used(ctx: ToolContext, conv: Conversation, events: list[dict[str, Any]]) -> list[str]:
    """The files an answer used (v8 "Used:" line): from the tools' workbook arguments and
    the cells they cited; a read-only copy in the working book counts as its source."""
    by_id = {r.id: r for r in conv.workbooks if getattr(r, "kind", "source") == "source"}
    sheet_owner: dict[str, str] = {}
    for rid in by_id:
        for sh in getattr(ctx.full.get(rid) or ctx.workbooks.get(rid), "sheets", {}) or {}:
            sheet_owner.setdefault(sh.lower(), rid)
    for sheet, meta in (ctx.imports or {}).items():
        if meta.get("from") in by_id:
            sheet_owner[sheet.lower()] = str(meta["from"])
    used: list[str] = []

    def add(rid: str | None) -> None:
        if rid in by_id and by_id[rid].name not in used:
            used.append(by_id[rid].name)

    for e in events:
        if e.get("type") == "tool_call":
            args = e.get("args") or {}
            for k in ("workbook_id", "workbook", "statement"):
                v = args.get(k)
                if isinstance(v, str):
                    add(v if v in by_id else next((i for i, r in by_id.items()
                                                   if v.lower() in r.name.lower()), None))
            if isinstance(args.get("sheet"), str):
                add(sheet_owner.get(args["sheet"].lower()))
        if e.get("type") in ("tool_result", "final") and e.get("ok", True):
            for c in e.get("citations") or []:
                sheet = str(c).rsplit("!", 1)[0].strip("'") if "!" in str(c) else ""
                add(sheet_owner.get(sheet.lower()))
    return used[:8]


CONFIDENT_ROUTE = 0.8   # tool_route confidence that offers 5 tools instead of 8

# Questions a trial balance answers with no model step (QA S5–S7).
_TB_INTENT = re.compile(
    r"\b(profit|loss|p\s*&\s*l|pnl|income statement|statement of (profit|comprehensive)|"
    r"gross profit|pbt|balance sheet|financial position|balances?\b|balanc(e|ing)|"
    r"revenue|turnover|cost of sales|admin\w* expenses?|cit|company income tax|"
    r"development levy|small company)", re.IGNORECASE)
_TB_OTHER_JOB = re.compile(
    r"\b(reconcil|bank statement|cash book|vat return|wht|withholding|payroll|paye|aging|"
    r"ageing|chart|plot|pivot|categori[sz]e|anomal|duplicate|journal|adjust|post\b|reclass|accru|depreciat|loan|schedule|prepay)", re.IGNORECASE)
_TB_TAX = re.compile(r"\b(cit|company income tax|development levy|small company|tax on)",
                     re.IGNORECASE)
# An edit request is never a question for the fast path, even on a trial balance.
_TB_EDIT_JOB = re.compile(
    r"\b(add|insert|create|columns?|rows?|formulas?|fill|sort|filter|format|rename|"
    r"delete|remove|highlight|copy|move|merge|bold|colou?r|clear)\b", re.IGNORECASE)
# A specific question about the TB ("which three expenses are largest", "share of
# revenue") needs the model and tb_lines, not the canned statements answer (live
# test 2026-11-18: it got the PBT summary instead of an answer).
_TB_SPECIFIC = re.compile(
    r"\b(which|largest|biggest|smallest|highest|lowest|top\s+\w+|share|percent(age)?|"
    r"proportion|list|compare|why|explain|each|trend|rank)\b|%", re.IGNORECASE)
_TB_NAME = re.compile(r"\btrial[\s_-]*balances?\b", re.IGNORECASE)
_TB_ANALYSIS = re.compile(
    r"\b(financial (analysis|calculation)|ratio analysis|ratios?|liquidity|solvency|gearing|"
    r"working capital|current ratio|quick ratio|cash ratio|margins?|debt[\s-]to[\s-]equity|"
    r"interest cover|return on (assets|equity|capital)|roa|roe)\b", re.IGNORECASE)
_SHEET_NAME = re.compile(r"\b(?:sheet|worksheet|tab)\s+(?:called|named)\s+[\"'\u201c]([^\"'\u201d]{1,31})",
                         re.IGNORECASE)


_STRONG_ANALYSIS = re.compile(r"\b(financial (analysis|calculation)|ratio analysis|"
                              r"liquidity analysis|analy[sz]e the (trial balance|tb))\b",
                              re.IGNORECASE)


def _wants_analysis(message: str) -> bool:
    """A financial-analysis job. With edit words ("add a margin column") only a
    clear analysis request counts, so a small edit is never swapped for a sheet."""
    if not _TB_ANALYSIS.search(message) or _TB_OTHER_JOB.search(message):
        return False
    return not _TB_EDIT_JOB.search(message) or bool(_STRONG_ANALYSIS.search(message))


def _year_end_fast_path(message: str, ctx: ToolContext, execute: Any, conv: Conversation
                        ) -> list[dict[str, Any]] | None:
    """A year-end review on a trial balance: the fixed recipe (sources, bank recs,
    depreciation, review points, statements, tax), each step visible, no model."""
    from litchai.workbench.recipes import wants_year_end, year_end_steps

    if not wants_year_end(message):
        return None
    steps = year_end_steps(ctx, conv.workbooks)
    events: list[dict[str, Any]] = [
        {"type": "start", "tools": [t for t, _ in steps], "max_steps": len(steps),
         "fast_path": True},
        {"type": "plan", "steps": [t for t, _ in steps], "layer": "decision", "fast_path": True}]
    done: list[tuple[str, Any]] = []
    cites: list[str] = []
    proposals: list[Any] = []
    for i, (name, args) in enumerate(steps, start=1):
        events.append({"type": "tool_call", "step": i, "tool": name, "args": args,
                       "layer": "pipeline"})
        obs = execute(name, args, i)
        events.append({"type": "tool_result", "step": i, "tool": name, "ok": obs.ok,
                       "summary": obs.summary, "error": obs.error, "proposal": obs.proposal,
                       "citations": (obs.citations or [])[:20], "data": obs.data})
        done.append((name, obs))
        cites += obs.citations or []
        if obs.proposal:
            proposals.append(obs.proposal)
    lines = ["I ran the year-end review in a fixed order. Every change is a proposal for you "
             "to accept."]
    for name, obs in done:
        if not obs.ok:
            lines.append(f"- {name.replace('_', ' ')}: could not run ({obs.error}).")
        elif name == "review_points":
            pts = (obs.data or {}).get("points") or []
            lines.append(f"- Review points ({len(pts)}):" if pts else "- Review points: none found by the rules.")
            lines += [f"  - {p['what']}: {p['fix']} ({p['source']})" for p in pts[:12]]
        elif name in ("trial_balance_statements", "tax_compute") and not str(
                (obs.data or {}).get("sheet", "")).lower().startswith("adjusted"):
            lines.append(f"- Before adjustments: {obs.summary}")
        else:
            lines.append(f"- {obs.summary}")
    lines.append("Next: tell me which review points to post as adjusting journals (one "
                 "proposal, with an adjusted TB), or give me the facts I need, for example "
                 "the loan terms.")
    events.append({"type": "final", "answer": "\n".join(lines),
                   "citations": list(dict.fromkeys(cites))[:40], "dropped_citations": [],
                   "proposals": proposals, "steps": len(steps), "fast_path": True,
                   "attribution": {"pipeline": [t for t, _ in steps], "model": None,
                                   "decision": "heuristic"}})
    return events


def _analysis_fast_path(message: str, ctx: ToolContext, execute: Any
                        ) -> list[dict[str, Any]] | None:
    """A trial balance is open and the request is a financial analysis (ratios,
    margins, liquidity, solvency): the pipeline builds the whole sheet with no model
    step. A weak or rate-limited model can no longer lose this job."""
    if not _wants_analysis(message):
        return None
    args: dict[str, Any] = {}
    m = _SHEET_NAME.search(message)
    if m:
        args["new_sheet_name"] = m.group(1).strip()
    events: list[dict[str, Any]] = [
        {"type": "start", "tools": ["financial_analysis"], "max_steps": 1, "fast_path": True},
        {"type": "plan", "steps": ["financial_analysis"], "layer": "decision", "fast_path": True},
        {"type": "tool_call", "step": 1, "tool": "financial_analysis", "args": args,
         "layer": "pipeline"}]
    obs = execute("financial_analysis", args, 1)
    events.append({"type": "tool_result", "step": 1, "tool": "financial_analysis", "ok": obs.ok,
                   "summary": obs.summary, "error": obs.error, "proposal": obs.proposal,
                   "citations": (obs.citations or [])[:20], "data": obs.data})
    if not obs.ok:
        return None
    d = obs.data or {}
    f = d.get("figures") or {}

    def n(k: str, pct: bool = False, x: bool = False) -> str:
        v = f.get(k)
        if not isinstance(v, (int, float)):
            return "?"
        return f"{v:.1%}" if pct else (f"{v:.2f}x" if x else f"₦{v:,.2f}")

    checks = d.get("checks") or {}
    names = {"chk_tb": "debits equal credits", "chk_bs": "balance sheet balances",
             "chk_wc": "working capital positive", "chk_cr": "current ratio at least 1.0"}
    answer = "\n".join([
        (f"I built the sheet {d.get('sheet', 'Financial Analysis')} from "
         f"{d.get('source', 'the TB')}. Every figure is a live formula over the TB cells."),
        (f"- Profitability: revenue {n('rev')}, gross profit {n('gp')} (gross margin "
         f"{n('gm', pct=True)}), operating profit {n('op')} (operating margin "
         f"{n('om', pct=True)}), profit before tax {n('pbt')}, net margin {n('nm', pct=True)}."),
        (f"- Liquidity: current assets {n('ca')}, current liabilities {n('cl')}, working "
         f"capital {n('wc')}, current ratio {n('cr', x=True)}, quick ratio "
         f"{n('qr', x=True)}, cash ratio {n('cashr', x=True)}."),
        (f"- Assets: PPE cost {n('ppe')}, accumulated depreciation {n('dep')}, net book "
         f"value {n('nbv')}, total assets {n('ta')}, total liabilities {n('tl')}."),
        "- Checks: " + ", ".join(f"{names[k]} {v}" for k, v in checks.items() if k in names) + ".",
        *[f"- Note: {x}" for x in d.get("notes") or []],
        "Accept the proposal to add the sheet.",
    ])
    events.append({"type": "final", "answer": answer, "citations": (obs.citations or [])[:20],
                   "dropped_citations": [], "proposals": [obs.proposal] if obs.proposal else [],
                   "steps": 1, "fast_path": True,
                   "attribution": {"pipeline": ["financial_analysis"], "model": None,
                                   "decision": "heuristic"}})
    return events


def _tb_question(message: str) -> bool:
    """A question the trial balance answers by itself. "trial balance" is the sheet's
    name, not the intent, so it is taken out before the intent is looked for."""
    text = _TB_NAME.sub(" ", message)
    return (bool(_TB_INTENT.search(text)) and not _TB_OTHER_JOB.search(message)
            and not _TB_EDIT_JOB.search(message) and not _TB_SPECIFIC.search(text))


def _tb_fast_path(message: str, ctx: ToolContext, execute: Any
                  ) -> list[dict[str, Any]] | None:
    """A trial balance is open and the question is about its profit, statements,
    balance or CIT: the pipeline answers with no model step (fast and sure)."""
    if not _tb_question(message):
        return None
    m = message.lower()
    only_check = bool(re.search(r"\bbalanc", m)) and not re.search(
        r"profit|income statement|p&l|balance sheet|financial position|cit|tax|revenue", m)
    steps: list[tuple[str, dict[str, Any]]] = [
        ("trial_balance_statements", {"write": not only_check})]
    if _TB_TAX.search(message):
        steps.append(("tax_compute", {"kind": "cit"}))
    events: list[dict[str, Any]] = [
        {"type": "start", "tools": [t for t, _ in steps], "max_steps": len(steps),
         "fast_path": True},
        {"type": "plan", "steps": [t for t, _ in steps], "layer": "decision", "fast_path": True}]
    outs, cites, proposals = [], [], []
    for i, (name, args) in enumerate(steps, start=1):
        events.append({"type": "tool_call", "step": i, "tool": name, "args": args,
                       "layer": "pipeline"})
        obs = execute(name, args, i)
        events.append({"type": "tool_result", "step": i, "tool": name, "ok": obs.ok,
                       "summary": obs.summary, "error": obs.error, "proposal": obs.proposal,
                       "citations": (obs.citations or [])[:20], "data": obs.data})
        if not obs.ok:
            return None  # let the model handle what the pipeline could not
        outs.append((name, obs))
        cites += obs.citations or []
        if obs.proposal:
            proposals.append(obs.proposal)
    answer = _tb_answer(outs, only_check, bool(proposals))
    events.append({"type": "final", "answer": answer, "citations": list(dict.fromkeys(cites))[:40],
                   "dropped_citations": [], "proposals": proposals, "steps": len(steps),
                   "fast_path": True,
                   "attribution": {"pipeline": [t for t, _ in steps], "model": None,
                                   "decision": "heuristic"}})
    return events


def _tb_answer(outs: list[tuple[str, Any]], only_check: bool, proposed: bool) -> str:
    from litchai.taxconfig import load_tax_config

    tb = next(o for n, o in outs if n == "trial_balance_statements").data
    lines = []
    bal = (f"The trial balance balances: debits and credits are both ₦{tb['total_debits']:,.2f}."
           if tb["balanced"] else
           f"The trial balance does NOT balance: debits ₦{tb['total_debits']:,.2f}, credits "
           f"₦{tb['total_credits']:,.2f}, difference ₦{tb['difference']:,.2f}.")
    lines.append(bal)
    if not only_check:
        p = tb["income_statement"]
        lines.append(
            f"Revenue ₦{p['revenue']:,.2f} less cost of sales ₦{p['cost_of_sales']:,.2f} gives "
            f"gross profit ₦{p['gross_profit']:,.2f}. Administrative expenses are "
            f"₦{p['administrative_expenses']:,.2f} and finance costs ₦{p['finance_costs']:,.2f}"
            f". Profit before tax is ₦{p['profit_before_tax']:,.2f}.")
        b = tb["balance_sheet"]
        lines.append(f"Balance sheet: total assets ₦{b['total_assets']:,.2f}; equity and "
                     f"liabilities ₦{b['total_equity_and_liabilities']:,.2f}.")
    if tb["unmapped"]:
        lines.append("Not mapped (check them): " + ", ".join(u["name"] for u in tb["unmapped"][:6])
                     + ".")
    tax = next((o for n, o in outs if n == "tax_compute"), None)
    if tax is not None:
        d = tax.data
        cfg = load_tax_config()
        sc = cfg["cit"]["smallCompany"]
        turnover = (d.get("profit_source") or {}).get("total_revenue")
        lines.append(f"CIT at {d['rate_pct']}% is ₦{d['cit']:,.2f} and the development levy at "
                     f"{cfg['cit']['developmentLevy']['ratePct']}% is "
                     f"₦{d['development_levy']:,.2f}: total ₦{d['total_tax']:,.2f}"
                     + (f", an effective rate of {d['total_tax'] / pbt_:.1%} of profit before "
                        f"tax." if (pbt_ := (d.get("profit_source") or {}).get("net_profit"))
                        else "."))
        if d["small_company"]:
            lines.append("The company is a small company (0% CIT, no levy).")
        elif turnover is not None and turnover > sc["maxTurnover"]:
            lines.append(f"It is not a small company: turnover ₦{turnover:,.2f} is above the "
                         f"₦{sc['maxTurnover']:,.0f} limit.")
        else:
            lines.append("It is not a small company under the config limits.")
        lines.append(f"Rates come from the firm's tax config {cfg['version']} (NTA 2025). No "
                     "tax adjustments were applied.")
    if proposed:
        lines.append("The income statement and balance sheet are a proposal: review and accept "
                     "them to add the sheets.")
    return " ".join(lines)
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
    # Files that became an xlsx working copy: say so, with what was lost.
    conversions = [{"workbook_id": ref.id, **ref.source} for ref in conv.workbooks
                   if ref.source and ref.source.get("converted")]
    overview = job_overview(ctx, conv)
    if overview["actions"]:
        # The job's own actions come first; the generic ones fill the rest.
        suggestions = list(overview["actions"]) + [
            s for s in suggestions if s not in overview["actions"]]
    return {"workbooks": profiles, "anomalies": anomalies, "suggestions": suggestions[:5],
            "conversions": conversions, "layer": "pipeline", **overview}


# Most useful file first (v6 C2): books and TB, then bank, ledgers, the rest.
_ROLE_RANK = {"trial_balance": 0, "books": 1, "bank_statement": 2, "ledger": 3,
              "sales_report": 4, "invoices": 5, "payroll": 6, "asset_register": 7,
              "other": 8, "document": 9}
_GRANT = re.compile(r"grant|donor|restricted fund", re.IGNORECASE)
_OVERVIEW_BUDGET_S = 8.0
_SECTOR_AREA = {"imports": "Imports", "rent": "Rent", "stock": "Stock",
                "settlements": "Settlements", "group": "Group and director",
                "purchases": "Purchases"}


def period_mismatch(files: list[dict[str, Any]]) -> str | None:
    """One plain sentence when the data files cover periods that do not overlap (a bank
    statement for January and a cash book for February cannot be reconciled)."""
    from datetime import date as _d

    def nice(x: str) -> str:
        try:
            return _d.fromisoformat(x).strftime("%d %b %Y").lstrip("0")
        except ValueError:
            return x

    spans = [(f["label"].split(" (")[0], f["period"]) for f in files
             if f.get("period") and f["role"] not in ("template", "document", "other", "register")]
    if len(spans) < 2:
        return None
    start = max(p[0] for _, p in spans)
    end = min(p[1] for _, p in spans)
    if start <= end:
        return None
    parts = "; ".join(f"{lbl}: {nice(p[0])} to {nice(p[1])}" for lbl, p in spans[:5])
    return (f"The files cover different periods ({parts}). Checks that compare files need "
            "the same period, so some answers will be partial. Add the missing months, or "
            "say which period to use.")


def fitting_checks(roles: set[str], names: str, scanned: bool = False) -> list[tuple[str, str]]:
    """The standard checks that fit the files in a job: (tool, plain title)."""
    checks: list[tuple[str, str]] = []
    if scanned:  # v8: figures read from a PDF or a scan are checked for misreads first
        checks.append(("scan_checks", "Scans"))
    if roles & {"trial_balance", "books"}:
        checks.append(("review_points", "Books"))
    if "sales_report" in roles:
        checks.append(("sales_checks", "Sales"))
    if "invoices" in roles:
        checks.append(("receivables_checks", "Invoices"))
    if "payroll" in roles:
        checks.append(("payroll_checks", "Payroll"))
    if _GRANT.search(names):
        checks.append(("grant_checks", "Grants"))
    checks.append(("sector_checks", ""))  # one area per kind that finds something
    return checks


def _job_checks(ctx: ToolContext, conv: Conversation) -> list[str]:
    roles = {ref.role or (ref.facts or {}).get("role") or "other" for ref in conv.workbooks}
    names = " ".join([ref.name for ref in conv.workbooks] + [
        s for w in ctx.workbooks.values() for s in w.sheets])
    # the anomaly checks fit every job (duplicates, text dates, text numbers)
    from litchai.workbench.scan_checks import scanned_names

    return [t for t, _ in fitting_checks(roles, names, bool(scanned_names(conv.workbooks)))] + [
        "flag_anomalies"]


def job_overview(ctx: ToolContext, conv: Conversation) -> dict[str, Any]:
    """What the job holds, what the first checks found, and what to do next (v6 C1).

    No model. Each file: its label, period and rows. Then the standard checks that
    fit the files run quietly (read only). Sage then asks what to do; it does not
    start a task by itself (C3)."""
    files: list[dict[str, Any]] = []
    for ref in conv.workbooks:
        if getattr(ref, "kind", "source") == "work":
            continue  # v8: the overview lists the sources, not the working book
        f = ref.facts or {}
        role = ref.role or f.get("role") or "other"
        files.append({"workbook_id": ref.id, "name": ref.name, "role": role,
                      "label": f.get("label") or role.replace("_", " "),
                      "bank": f.get("bank"), "period": f.get("period"),
                      "rows": f.get("rows"), "group": ref.group, "note": ref.note or ""})
    roles = {f["role"] for f in files}
    names = " ".join([f["name"] for f in files] + [
        s for w in ctx.workbooks.values() for s in w.sheets])
    has_tb = bool(roles & {"trial_balance", "books"})
    banks = [f for f in files if f["role"] == "bank_statement"]

    from litchai.workbench.scan_checks import scanned_names

    checks = fitting_checks(roles, names, bool(scanned_names(conv.workbooks)))

    findings: list[dict[str, Any]] = []
    periods = period_mismatch(files)
    if periods:
        findings.append({"area": "Periods", "tool": "periods", "count": 1, "top": [periods]})
    from litchai.workbench.macros import summary_line as macro_line

    for ref in conv.workbooks:  # v8: macros are read, never run
        if (ref.source or {}).get("macros"):
            findings.append({"area": f"Macros in {ref.name}", "tool": "read_macros", "count": 1,
                             "top": [macro_line(ref.source["macros"])]})
    start = time.monotonic()
    for tool, title in checks:
        if time.monotonic() - start > _OVERVIEW_BUDGET_S:
            break  # a large job: the rest run when the person asks
        try:
            data = run_tool(ctx, tool, {}).data or {}
        except Exception:  # noqa: BLE001, S112 - a first look never fails on one check
            continue
        items = data.get("points") or data.get("findings") or []
        if tool == "sector_checks":  # one area per kind that found something
            by_kind: dict[str, list[dict[str, Any]]] = {}
            for i in items:
                by_kind.setdefault(i.get("kind", "other"), []).append(i)
            for kind, its in by_kind.items():
                findings.append({"area": _SECTOR_AREA.get(kind, kind.title()), "tool": tool,
                                 "count": len(its),
                                 "top": [str(i.get("what", ""))[:160] for i in its[:3]]})
            continue
        findings.append({"area": title, "tool": tool, "count": len(items),
                         "top": [str(i.get("what", ""))[:160] for i in items[:3]]})

    actions: list[str] = []
    if has_tb:
        actions.append("Check the books and list the adjustments needed")
    for b in banks[:2]:
        if has_tb or "ledger" in roles:
            actions.append(f"Reconcile the {b['bank'] or 'bank'} statement to the books")
    for f in findings:
        if f["tool"] != "review_points" and f["count"]:
            actions.append(f"Explain the {f['area'].lower()} findings")
    if has_tb:
        actions.append("Prepare the financial statements and the tax")
    seen: set[str] = set()
    actions = [a for a in actions if not (a in seen or seen.add(a))][:4]

    primary = min(files, key=lambda f: _ROLE_RANK.get(f["role"], 8))["workbook_id"] \
        if files else None
    return {"files": files, "findings": findings, "actions": actions,
            "primary_workbook_id": primary,
            "question": "What would you like me to do?" if files else None}


CHECK_TOOLS = {"sales_checks", "receivables_checks", "grant_checks", "payroll_checks",
               "sector_checks",
               "review_points"}


def _plan_for(has_tb: bool, job_checks: list[str] | None = None) -> Any:
    """The deterministic plan when the model is down or keeps sending malformed
    steps: on a trial balance, its statements (and CIT when asked); else the
    decision layer's keyword plan."""
    def plan(message: str) -> list[tuple[str, dict[str, Any]]]:
        # An edit request is never answered with unrelated statements or tax: only a
        # step that does what was asked, or nothing (the person is told to try again).
        if has_tb and _wants_analysis(message):
            return [("financial_analysis", {})]
        keyword = fallback_plan(message)
        if not has_tb:  # the year-end review needs a trial balance
            keyword = [s for s in keyword if s[0] != "review_points"]
        checks = [s for s in keyword if s[0] in CHECK_TOOLS]
        if checks and not _TB_EDIT_JOB.search(message):
            # The standard checks answer "what is wrong" better than the statements
            # (19 Nov: an NGO review got only the TB statements). Other steps the
            # request names (a reconciliation) still run. The other checks that fit the
            # files are added (NGO run 22 Nov: the grant check ran, but the books check
            # that finds unbooked bank charges did not).
            have = {t for t, _ in keyword}
            extra = [(t, {}) for t in (job_checks or []) if t not in have and t != "flag_anomalies"]
            return (keyword + extra)[:6]
        if _TB_EDIT_JOB.search(message):
            if re.search(r"\b(classif|categor|account type)", message, re.IGNORECASE):
                return [("categorise_rows", {})]
            return []
        if has_tb and _tb_question(message):
            steps: list[tuple[str, dict[str, Any]]] = [("trial_balance_statements", {})]
            if _TB_TAX.search(message):
                steps.append(("tax_compute", {"kind": "cit"}))
            return steps
        if job_checks and all(s[0] == "profile_workbook" for s in keyword):
            # Nothing in the words fits a step: run the checks that fit the job's files,
            # rather than only describing them (fintech run, 20 Nov).
            return [(t, {}) for t in job_checks][:4]
        return keyword
    return plan

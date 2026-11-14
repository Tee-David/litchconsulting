"use client";

import { Fragment, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRightLeft, Check, ChevronDown, Circle, ListTree, Loader2, RefreshCw, X } from "lucide-react";
import type { WbEvent } from "@/lib/litchai/workbench";
import { REF_IN_TEXT } from "./refs";
import { cn } from "@/lib/utils";
import { FAILURE, failureKind, modelName, slotLabel } from "@/lib/ai-words";

export const PROVIDER_LABEL: Record<string, string> = {
  groq: "Groq",
  cerebras: "Cerebras",
  sambanova: "SambaNova",
  cloudflare: "Cloudflare",
  openrouter: "OpenRouter",
  local: "Local model",
  chat: "Chat provider",
};
const REASON: Record<string, string> = {
  quota: "reached its daily limit",
  rate_limit: "is busy (rate limit for this minute)",
  timeout: "timed out",
  unavailable: "could not be reached",
  error: "returned an error",
  auth: "rejected our key",
  invalid: "sent steps Sage could not use",
  unhealthy: "is not answering",
};

export const TOOL_LABEL: Record<string, string> = {
  profile_workbook: "Read the workbook",
  profile_range: "Read a range",
  query_sql: "Query the sheets",
  categorise_rows: "Classify rows",
  build_statement: "Build a statement",
  pivot: "Pivot table",
  write_cells: "Write cells",
  add_formula_column: "Add a formula column",
  add_chart: "Propose a chart",
  reconcile: "Reconcile bank to ledger",
  flag_anomalies: "Check for anomalies",
  tax_compute: "Compute tax",
  create_sheet: "New sheet",
  create_workbook: "New workbook",
  clean_values: "Convert text values",
  trial_balance_statements: "Statements from the trial balance",
};

const s = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

function argsSummary(tool: string, args: Record<string, unknown>): string {
  if (tool === "query_sql") return s(args.sql).replace(/\s+/g, " ").slice(0, 90);
  if (tool === "write_cells" && Array.isArray(args.cells)) {
    const cells = args.cells as { cell?: string }[];
    return `${s(args.sheet) || "sheet"} · ${cells.length} cell${cells.length === 1 ? "" : "s"} from ${s(cells[0]?.cell)}`;
  }
  const bits = [args.kind, args.sheet && args.range ? `${s(args.sheet)}!${s(args.range)}` : args.sheet, args.new_sheet_name, args.title, args.rows_column]
    .filter(Boolean)
    .map(s);
  return bits.join(" · ");
}

/** Clickable `Sheet!A1` references inside Sage's prose. */
export function CitedText({ text, onCite }: { text: string; onCite: (ref: string) => void }) {
  const lines = text.split(/\n+/).filter((l) => l.trim());
  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-ink" data-sage-answer>
      {lines.map((line, i) => {
        const bullet = /^\s*[-•*]\s+/.test(line);
        const body = line.replace(/^\s*[-•*]\s+/, "");
        const parts: ReactNode[] = [];
        let last = 0;
        for (const m of body.matchAll(REF_IN_TEXT)) {
          parts.push(bold(body.slice(last, m.index)));
          parts.push(<CiteChip key={`${i}-${m.index}`} refText={m[0]} onCite={onCite} />);
          last = (m.index ?? 0) + m[0].length;
        }
        parts.push(bold(body.slice(last)));
        return bullet ? (
          <p key={i} className="flex gap-2 pl-1"><span aria-hidden className="text-faint">•</span><span>{parts}</span></p>
        ) : (
          <p key={i}>{parts}</p>
        );
      })}
    </div>
  );
}

function bold(text: string): ReactNode {
  const out = text.split(/(\*\*[^*]+\*\*)/g);
  return out.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

export function CiteChip({ refText, onCite }: { refText: string; onCite: (ref: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCite(refText)}
      className="mx-0.5 inline-flex items-center rounded-md border border-transparent bg-brand-tint px-1.5 font-mono text-[11.5px] text-accent hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      aria-label={`Go to cell ${refText}`}
    >
      {refText}
    </button>
  );
}

type Step = { t: string; d?: string; s: "done" | "run" | "wait" | "fail" | "switch" };

/** The steps of one turn, in order: tools (with what they did) and provider switches. */
function stepsOf(events: WbEvent[], running: boolean): Step[] {
  const out: Step[] = [];
  const results = new Map(events.filter((e) => e.type === "tool_result").map((e) => [Number(e.step), e]));
  for (const e of events) {
    if (e.type === "tool_call") {
      const tool = s(e.tool);
      const r = results.get(Number(e.step));
      const args = argsSummary(tool, (e.args as Record<string, unknown>) ?? {});
      out.push({
        t: TOOL_LABEL[tool] ?? tool,
        d: r ? (r.ok === false ? s(r.error) : s(r.summary)) : args,
        s: r ? (r.ok === false ? "fail" : "done") : running ? "run" : "fail",
      });
    } else if (e.type === "fallback" && s(e.detail) !== "skipped") {
      out.push({
        t: e.from === "all" ? "No model could be used" : `${slotLabel(s(e.from))} ${REASON[s(e.reason)] ?? "failed"}`,
        d: e.to ? `Moved to ${slotLabel(s(e.to))}. Steps already done were kept.` : e.from === "all" ? "The pipeline ran what it could without one." : undefined,
        s: "switch",
      });
    }
  }
  // Plan steps not reached yet (live): shown as waiting.
  const plan = events.find((e) => e.type === "plan");
  const planSteps = Array.isArray(plan?.steps) ? (plan!.steps as unknown[]).map(s) : [];
  const calls = events.filter((e) => e.type === "tool_call").length;
  if (running) for (const p of planSteps.slice(calls)) out.push({ t: TOOL_LABEL[p] ?? p, s: "wait" });
  return out;
}

/** One line that says how the answer was made: steps, where the numbers came from, which model. */
function receipt(events: WbEvent[]): string {
  const calls = events.filter((e) => e.type === "tool_call").length;
  const fallbacks = events.filter((e) => e.type === "fallback" && s(e.detail) !== "skipped");
  const provider = [...events].reverse().find((e) => e.type === "provider");
  const final = events.find((e) => e.type === "final");
  const att = (final?.attribution ?? {}) as { pipeline?: string[]; model?: string | null };
  const fastPath = events.some((e) => (e.type === "start" || e.type === "plan") && (e as { fast_path?: boolean }).fast_path) || fallbacks.length === 0;
  const bits: string[] = [];
  bits.push(calls ? `${calls} step${calls === 1 ? "" : "s"}` : "Answered directly");
  if ((att.pipeline ?? []).length) bits.push("numbers from the pipeline");
  if (att.model) {
    const m = modelName(s(provider?.model)) || slotLabel(att.model);
    const p = PROVIDER_LABEL[att.model.split(":")[0]] ?? "";
    bits.push(m && p && !m.startsWith(p) ? `${m} on ${p}` : m || p);
  } else bits.push(fastPath ? "no model needed" : "no model reachable");
  const switched = fallbacks.filter((f) => f.from !== "all").length;
  if (switched) bits.push(`${switched} provider switch${switched === 1 ? "" : "es"}`);
  return bits.join(" · ");
}

function StepIcon({ st }: { st: Step["s"] }) {
  if (st === "done") return <Check className="size-3.5 text-good" aria-label="Done" />;
  if (st === "run") return <Loader2 className="size-3.5 animate-spin text-accent" aria-label="Running" />;
  if (st === "fail") return <X className="size-3.5 text-bad" aria-label="Failed" />;
  if (st === "switch") return <ArrowRightLeft className="size-3.5 text-warn" aria-label="Provider switch" />;
  return <Circle className="size-3 text-faint" aria-label="Waiting" />;
}

/** Plan + tool steps + notices + the answer for one turn (live or from history). */
export function TurnView({
  events,
  running,
  onCite,
  onRetry,
}: {
  events: WbEvent[];
  running: boolean;
  onCite: (ref: string) => void;
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const final = events.find((e) => e.type === "final");
  const error = events.find((e) => e.type === "error");
  const steps = stepsOf(events, running);
  const retries = events.filter((e) => e.type === "retry").length;
  const live = running && !final && !error;
  const current = steps.find((x) => x.s === "run");
  const lastSwitch = [...events].reverse().find((e) => e.type === "fallback" && s(e.detail) !== "skipped" && e.from !== "all");
  const showSteps = live || open;

  return (
    <div className="space-y-2.5">
      {steps.length > 0 || live ? (
        <div className={cn("rounded-xl border bg-paper", live ? "border-line-strong" : "border-hairline")}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={live}
            aria-expanded={showSteps}
            className="flex min-h-9 w-full items-center gap-2 px-2.5 text-left text-[12.5px] text-body hover:text-ink disabled:cursor-default"
          >
            {live ? (
              <>
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{current ? `${current.t}…` : steps.length ? "Thinking…" : "Reading the workbook…"}</span>
              </>
            ) : (
              <>
                <ListTree className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{receipt(events)}</span>
                <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
              </>
            )}
          </button>
          {showSteps && steps.length > 0 ? (
            <ol className="space-y-1 px-2.5 pb-2.5" aria-label="How Sage did this">
              {steps.map((x, i) => (
                <li key={i} className="grid grid-cols-[16px_1fr] gap-2 py-0.5 text-[12.5px]">
                  <span className="mt-0.5 grid size-4 place-items-center"><StepIcon st={x.s} /></span>
                  <span className="min-w-0">
                    <span className={cn(x.s === "wait" ? "text-muted" : "text-ink")}>{x.t}</span>
                    {x.d ? <span className="block break-words text-[12px] text-muted">{x.d}</span> : null}
                  </span>
                </li>
              ))}
              {retries > 0 && !live ? (
                <li className="flex items-center gap-1.5 pl-6 text-[11.5px] text-muted">
                  <RefreshCw className="size-3" aria-hidden /> {retries === 1 ? "One step was malformed and asked again." : `${retries} steps were malformed and asked again.`}
                </li>
              ) : null}
            </ol>
          ) : null}
        </div>
      ) : null}

      {live && lastSwitch ? (
        <p className="flex items-start gap-2 rounded-ctl bg-warn-soft px-2.5 py-2 text-[12.5px] text-body" role="status">
          <ArrowRightLeft className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
          {slotLabel(s(lastSwitch.from))} {REASON[s(lastSwitch.reason)] ?? "failed"}.{lastSwitch.to ? ` Moving to ${slotLabel(s(lastSwitch.to))}.` : ""}
        </p>
      ) : null}

      {final ? (
        <div className="space-y-2">
          <CitedText text={s(final.answer)} onCite={onCite} />
          {Array.isArray(final.citations) && final.citations.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11.5px] text-muted">Cells used:</span>
              {(final.citations as string[]).slice(0, 12).map((c) => <CiteChip key={c} refText={c} onCite={onCite} />)}
            </div>
          ) : null}
          {Array.isArray(final.unverified_figures) && final.unverified_figures.length > 0 ? (
            <div className="rounded-ctl bg-warn-soft px-2.5 py-2 text-[12.5px] text-ink" role="note">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-3.5 text-warn" aria-hidden /> Check these figures
              </p>
              <p className="mt-0.5 text-body">
                No tool result backs{" "}
                {(final.unverified_figures as unknown[]).slice(0, 8).map((f, i) => (
                  <span key={i}>{i ? ", " : ""}<b className="font-mono font-semibold text-ink">{s(f)}</b></span>
                ))}
                . Ask Sage to compute {final.unverified_figures.length === 1 ? "it" : "them"} before you rely on {final.unverified_figures.length === 1 ? "it" : "them"}.
              </p>
            </div>
          ) : null}
          {final.truncated ? <p className="text-[12.5px] text-warn">Stopped at the step limit. Ask Sage to continue.</p> : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-ctl bg-bad-soft px-3 py-2.5 text-[12.5px]" role="alert">
          <p className="font-semibold text-ink">{failureKind(error.reason) ? FAILURE[failureKind(error.reason)!].title : "That turn did not finish."}</p>
          <p className="mt-0.5 text-body">
            {failureKind(error.reason) ? FAILURE[failureKind(error.reason)!].next : s(error.message)} Proposals made before it stopped are kept.
          </p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="mt-2 min-h-8 rounded-ctl border border-hairline bg-paper px-2.5 text-[12.5px] font-medium text-ink hover:bg-cloud">
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

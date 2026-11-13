"use client";

import { Fragment, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, Cpu, Loader2, RefreshCw, Sparkles, X, Zap } from "lucide-react";
import type { WbEvent } from "@/lib/litchai/workbench";
import { REF_IN_TEXT } from "./refs";
import { cn } from "@/lib/utils";
import { FAILURE, answeredBy, engineLabel, failureKind, slotLabel } from "@/lib/ai-words";

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
  rate_limit: "was rate limited",
  timeout: "timed out",
  unavailable: "could not be reached",
  error: "returned an error",
  auth: "rejected our key",
  invalid: "kept returning invalid steps",
};

export const TOOL_LABEL: Record<string, string> = {
  profile_workbook: "Profile the workbook",
  profile_range: "Profile a range",
  query_sql: "Query the sheets",
  categorise_rows: "Categorise rows",
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
};

const s = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

function argsSummary(tool: string, args: Record<string, unknown>): string {
  if (tool === "query_sql") return s(args.sql).replace(/\s+/g, " ").slice(0, 90);
  const bits = [args.kind, args.sheet && args.range ? `${s(args.sheet)}!${s(args.range)}` : args.sheet, args.new_sheet_name, args.title, args.rows_column]
    .filter(Boolean)
    .map(s);
  return bits.join(" · ");
}

/** Clickable `Sheet!A1` references inside Sage's prose. */
export function CitedText({ text, onCite }: { text: string; onCite: (ref: string) => void }) {
  const lines = text.split(/\n+/).filter((l) => l.trim());
  return (
    <div className="space-y-1.5 text-[13.5px] leading-relaxed text-ink">
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
      className="mx-0.5 inline-flex items-center rounded border border-info/30 bg-info-soft px-1 font-mono text-[11.5px] text-info hover:border-info focus-visible:outline focus-visible:outline-2 focus-visible:outline-info"
      aria-label={`Go to cell ${refText}`}
    >
      {refText}
    </button>
  );
}

function LayerChip({ layer }: { layer: "pipeline" | "decision" | "model" }) {
  const map = {
    pipeline: { icon: Cpu, text: "Pipeline", cls: "bg-cloud text-body" },
    decision: { icon: Zap, text: "Decision layer", cls: "bg-violet-soft text-violet" },
    model: { icon: Sparkles, text: "Model", cls: "bg-good-soft text-good" },
  }[layer];
  const I = map.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-medium", map.cls)}>
      <I className="size-3" aria-hidden />
      {map.text}
    </span>
  );
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
  const plan = events.find((e) => e.type === "plan");
  const calls = events.filter((e) => e.type === "tool_call");
  const results = new Map(events.filter((e) => e.type === "tool_result").map((e) => [Number(e.step), e]));
  const fallbacks = events.filter((e) => e.type === "fallback");
  // A decision-layer plan is "no model reachable" only when the turn shows a provider
  // failure. Otherwise the pipeline answered by design (the trial balance fast path),
  // including turns saved before the plan carried the fast_path flag.
  const fastPath =
    events.some((e) => (e.type === "start" || e.type === "plan") && (e as { fast_path?: boolean }).fast_path) ||
    fallbacks.length === 0;
  const retries = events.filter((e) => e.type === "retry");
  const provider = [...events].reverse().find((e) => e.type === "provider");
  const final = events.find((e) => e.type === "final");
  const error = events.find((e) => e.type === "error");
  const planSteps = Array.isArray(plan?.steps) ? (plan!.steps as unknown[]).map(s) : [];
  const done = results.size;

  return (
    <div className="space-y-2.5">
      {planSteps.length > 0 && (
        <div className="rounded-card border border-hairline bg-paper">
          <p className="border-b border-hairline px-3 py-2 text-[12px] font-semibold text-ink">
            Plan · {planSteps.length} step{planSteps.length === 1 ? "" : "s"}
            {plan?.layer === "decision" ? <span className="ml-2 font-normal text-muted">{fastPath ? "(answered by the pipeline, no model needed)" : "(no model reachable: run directly)"}</span> : null}
          </p>
          <ol className="space-y-1 px-3 py-2">
            {planSteps.map((p, i) => {
              const st = i < done ? "done" : i === done && running ? "run" : "queued";
              return (
                <li key={i} className="flex items-start gap-2 text-[12.5px]">
                  <span
                    className={cn(
                      "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                      st === "done" ? "bg-good text-paper" : st === "run" ? "bg-info-soft text-info" : "bg-cloud text-muted",
                    )}
                    aria-label={st === "done" ? "Done" : st === "run" ? "Running" : "Queued"}
                  >
                    {st === "done" ? <Check className="size-3" /> : st === "run" ? <Loader2 className="size-3 animate-spin" /> : i + 1}
                  </span>
                  <span className={cn(st === "queued" ? "text-muted" : "text-ink")}>{p}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {calls.length > 0 && (
        <ul className="space-y-1.5" aria-label="Steps Sage ran">
          {calls.map((c) => {
            const r = results.get(Number(c.step));
            const tool = s(c.tool);
            const ok = r?.ok === true;
            const failed = r && r.ok === false;
            return (
              <li key={s(c.step)} className="rounded-ctl border border-hairline bg-surface px-2.5 py-2 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("grid size-4 place-items-center rounded-full", ok ? "bg-good text-paper" : failed ? "bg-bad text-paper" : "bg-info-soft text-info")}>
                    {ok ? <Check className="size-3" aria-label="Done" /> : failed ? <X className="size-3" aria-label="Failed" /> : <Loader2 className="size-3 animate-spin" aria-label="Running" />}
                  </span>
                  <span className="font-medium text-ink">{TOOL_LABEL[tool] ?? tool}</span>
                  <span className="font-mono text-[11px] text-muted">{tool}</span>
                  <LayerChip layer="pipeline" />
                </div>
                {argsSummary(tool, (c.args as Record<string, unknown>) ?? {}) ? (
                  <p className="mt-1 truncate font-mono text-[11px] text-muted">{argsSummary(tool, (c.args as Record<string, unknown>) ?? {})}</p>
                ) : null}
                {r ? <p className={cn("mt-1", failed ? "text-bad" : "text-body")}>{failed ? s(r.error) : s(r.summary)}</p> : null}
              </li>
            );
          })}
        </ul>
      )}

      {retries.length > 0 && (
        <p className="text-[11.5px] text-muted">
          <RefreshCw className="mr-1 inline size-3" aria-hidden />
          Sage sent {retries.length === 1 ? "a malformed step and was" : `${retries.length} malformed steps and was`} asked again.
        </p>
      )}

      {fallbacks.map((f, i) => (
        <div key={i} className="rounded-card border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-ink" role="status">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5 text-warn" aria-hidden /> Switched provider
          </p>
          <p className="mt-0.5 text-body">
            {f.from === "all"
              ? "No language model could be reached."
              : `${slotLabel(s(f.from))} ${REASON[s(f.reason)] ?? "failed"}.`}{" "}
            {f.to ? (
              <>Moved this conversation to <b>{slotLabel(s(f.to))}</b><ArrowRight className="mx-1 inline size-3" aria-hidden />steps already done were kept, nothing was redone.</>
            ) : f.from === "all" ? "The pipeline ran the steps it could without one." : null}
          </p>
        </div>
      ))}

      {final ? (
        <div className="space-y-2">
          {final.degraded ? (
            <p className="rounded-ctl bg-cloud px-2.5 py-1.5 text-[12px] text-body">No language model was reachable, so these are the pipeline&rsquo;s own results.</p>
          ) : null}
          <CitedText text={s(final.answer)} onCite={onCite} />
          {Array.isArray(final.citations) && final.citations.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted">Cells:</span>
              {(final.citations as string[]).slice(0, 12).map((c) => <CiteChip key={c} refText={c} onCite={onCite} />)}
            </div>
          ) : null}
          {Array.isArray(final.unverified_figures) && final.unverified_figures.length > 0 ? (
            <div className="rounded-ctl border border-warn/30 bg-warn-soft px-2.5 py-2 text-[12px] text-ink" role="note">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-3.5 text-warn" aria-hidden /> Check these figures
              </p>
              <p className="mt-0.5 text-body">
                No tool result backs{" "}
                {(final.unverified_figures as unknown[]).slice(0, 8).map((f, i) => (
                  <span key={i}>{i ? ", " : ""}<b className="font-mono font-semibold text-ink">{s(f)}</b></span>
                ))}
                . Don&rsquo;t rely on {final.unverified_figures.length === 1 ? "it" : "them"} until a tool confirms: ask Sage to compute {final.unverified_figures.length === 1 ? "it" : "them"}.
              </p>
            </div>
          ) : null}
          {final.truncated ? <p className="text-[12px] text-warn">Stopped at the step limit. Ask Sage to continue.</p> : null}
          <Attribution final={final} provider={provider} />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-card border border-bad/30 bg-bad-soft px-3 py-2 text-[12.5px]" role="alert">
          <p className="font-semibold text-ink">{failureKind(error.reason) ? FAILURE[failureKind(error.reason)!].title : "That turn did not finish."}</p>
          <p className="mt-0.5 text-body">
            {failureKind(error.reason) ? FAILURE[failureKind(error.reason)!].next : s(error.message)} Proposals made before it stopped are kept below.
          </p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="mt-2 rounded-ctl border border-hairline bg-paper px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-cloud">
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {running && !final && !error ? (
        <p className="flex items-center gap-1.5 text-[12px] text-muted" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {calls.length ? "Working…" : "Reading the workbook…"}
        </p>
      ) : null}
    </div>
  );
}

/** Which layer did what: numbers (pipeline), routing (decision), words (model). */
export function Attribution({ final, provider }: { final: WbEvent; provider?: WbEvent }) {
  const att = (final.attribution ?? {}) as { pipeline?: string[]; model?: string | null; decision?: string };
  const tools = [...new Set(att.pipeline ?? [])];
  const model = att.model ? PROVIDER_LABEL[att.model] ?? att.model : null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5" aria-label="What powered this answer">
      <span className="inline-flex items-center gap-1 rounded-full bg-cloud px-2 py-0.5 text-[11px] text-body" title={tools.join(", ")}>
        <Cpu className="size-3" aria-hidden /> Every number: pipeline{tools.length ? ` (${tools.length} tool${tools.length === 1 ? "" : "s"})` : ""}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-soft px-2 py-0.5 text-[11px] text-violet">
        <Zap className="size-3" aria-hidden /> Routing: decision layer
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-[11px] text-good">
        <Sparkles className="size-3" aria-hidden />
        <span title={model ? `${model}${provider?.model ? ` · ${s(provider.model)}` : ""}` : undefined}>
          {model
            ? answeredBy(att.model, provider?.model ? s(provider.model) : null, provider?.kind ? s(provider.kind) : null) ||
              `Wording: ${engineLabel(att.model === "local" ? "local" : "cloud")}`
            : "Wording: none (no model)"}
        </span>
      </span>
    </div>
  );
}

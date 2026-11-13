"use client";

import Link from "next/link";
import { AlertTriangle, Copy, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { FAILURE, type FailureKind } from "@/lib/ai-words";
import { barsFor, keyFigureFor, provenanceFor, sourcesFor, type SageProposal, type SageRole, type SageTurn } from "@/lib/sage/present";
import { cn } from "@/lib/utils";
import { CitationTick } from "./citation-tick";
import { RevealMarkdown, SageMarkdown } from "./markdown";
import { ProposalPlan } from "./proposal-plan";
import { ProvenanceLine } from "./provenance";
import { SourcesList } from "./sources";

/** The Sage mark: a small solid tile with the initial. */
export function SageMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center bg-act font-display font-semibold text-act-ink",
        size === "sm" ? "size-6 rounded-[7px] text-xs" : "size-8 rounded-ctl text-[13px]",
      )}
    >
      S
    </span>
  );
}

export function UserBubble({ text, at, compact = false }: { text: string; at?: string; compact?: boolean }) {
  return (
    <div className="flex flex-col items-end gap-1 self-end">
      <div className={cn("whitespace-pre-wrap rounded-[16px_16px_4px_16px] bg-act px-4 py-2.5 leading-normal text-act-ink", compact ? "max-w-[88%] text-sm" : "max-w-[520px] text-[14.5px]")}>
        {text}
      </div>
      {at ? <span className="text-[11.5px] text-muted">You · {at}</span> : null}
    </div>
  );
}

/** Plain words for an answer Sage could not give, with the next step and a retry. */
export function FailureNotice({ kind, onRetry }: { kind: FailureKind; onRetry?: () => void }) {
  const f = FAILURE[kind];
  return (
    <div role="alert" className="rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-warn">
        <AlertTriangle className="size-4 shrink-0" strokeWidth={1.5} aria-hidden /> {f.title}
      </p>
      <p className="mt-0.5 text-body">{f.next}</p>
      {onRetry ? (
        <Button size="sm" className="mt-2.5" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden /> Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Staff answer held back until the engine confirms the staff scope. */
export function HeldNotice() {
  return (
    <div role="status" className="rounded-xl border border-hairline bg-surface px-3.5 py-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-ink">
        <Lock className="size-4 shrink-0 text-muted" strokeWidth={1.5} aria-hidden /> Sage for staff is being switched on
      </p>
      <p className="mt-0.5 text-body">Sage did not confirm that it kept to your assigned requests, so this answer is not shown. Try again later.</p>
    </div>
  );
}

/** "Sage is working", with plain words when the wait is long. */
export function Working({ seconds, onStop }: { seconds: number; onStop?: () => void }) {
  const note =
    seconds >= 40
      ? "This is slow. The private local model can take up to a minute."
      : seconds >= 12
        ? "Still working. The AI model may be busy."
        : null;
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-2.5">
      <SageMark size="sm" />
      <div className="text-[13px] text-body">
        <p className="flex h-6 items-center gap-2">
          Sage is working
          <span className="inline-flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 rounded-full bg-muted motion-safe:animate-[pulse_1.2s_ease-in-out_infinite]" style={{ animationDelay: `${i * 200}ms` }} />
            ))}
          </span>
        </p>
        {note ? (
          <p className="text-xs text-muted">
            {note} <span className="tabular-nums">({seconds} s)</span>
            {onStop ? (
              <>
                {" "}
                <button type="button" onClick={onStop} className="font-medium text-ink underline underline-offset-2">
                  Stop
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One Sage answer as a working paper: the key figure first, the words with
 * audit ticks, bars when the data is a ranking, the plan to confirm, how the
 * answer was made, and a margin of sources (under the answer on phones and in
 * the widget).
 */
export function SageAnswer({
  turn,
  role,
  compact = false,
  busy = false,
  onRetry,
  onConfirm,
  onDismiss,
}: {
  turn: SageTurn;
  role: SageRole;
  /** Widget: one column, sources under the answer, smaller type. */
  compact?: boolean;
  busy?: boolean;
  onRetry?: () => void;
  onConfirm?: (p: SageProposal) => void;
  onDismiss?: () => void;
}) {
  const toast = useToast();
  const id = turn.id;
  if (turn.held) return <HeldNotice />;
  if (turn.failure) return <FailureNotice kind={turn.failure} onRetry={onRetry} />;

  const sources = sourcesFor(turn, role);
  const figure = keyFigureFor(turn.tool, turn.toolResult);
  const bars = barsFor(turn.tool, turn.toolResult);
  const facts = provenanceFor(turn);
  const hasInlineTicks = /\[\d{1,2}\](?!\()/.test(turn.content);
  const Text = turn.fresh ? RevealMarkdown : SageMarkdown;

  const main = (
    <div className={cn("flex min-w-0 flex-col", compact ? "gap-3 p-3.5" : "gap-4 p-5 sm:px-6 sm:py-5")}>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <SageMark size="sm" />
        Sage
        {turn.seconds ? <span className="text-xs font-normal text-muted">· answered in {turn.seconds} s</span> : null}
        <button
          type="button"
          aria-label="Copy the answer"
          onClick={() => {
            void navigator.clipboard?.writeText(turn.content).then(() => toast.success("Copied"));
          }}
          className="ml-auto grid size-8 place-items-center rounded-ctl text-muted outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Copy className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      {figure ? (
        <div className={cn("flex flex-wrap items-end gap-x-4 gap-y-1 border-b border-hairline", compact ? "pb-3" : "pb-4")}>
          <div>
            <p className="text-[12.5px] text-muted">{figure.label}</p>
            <p className={cn("font-display font-semibold leading-tight tracking-[-0.02em] tabular-nums text-ink", compact ? "text-2xl" : "text-[34px]")}>{figure.value}</p>
          </div>
          {figure.sub ? (
            <p className={cn("pb-1 text-[13.5px] leading-snug", figure.tone === "bad" ? "text-bad" : figure.tone === "warn" ? "text-warn" : "text-body")}>{figure.sub}</p>
          ) : null}
        </div>
      ) : null}

      {turn.content ? (
        <div>
          <Text content={turn.content} answerId={id} sourceCount={sources.length} compact={compact} />
          {sources.length && !hasInlineTicks ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted">
              Based on
              {sources.map((s) => (
                <CitationTick key={s.n} n={s.n} answerId={id} title={s.title} />
              ))}
            </p>
          ) : null}
        </div>
      ) : null}

      {bars ? (
        <div>
          <p className="mb-2 text-[12.5px] text-muted">{bars.title}</p>
          <ul className="flex flex-col gap-2">
            {(() => {
              const max = Math.max(...bars.rows.map((r) => r.value), 1);
              return bars.rows.map((r) => (
                <li key={r.label} className={cn("grid items-center gap-x-3 gap-y-1 text-[13.5px]", compact ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[200px_minmax(0,1fr)_110px]")}>
                  <span className="truncate text-ink">{r.label}</span>
                  <span className={cn("col-span-2 h-2.5 overflow-hidden rounded-[3px] bg-surface", !compact && "sm:col-span-1 sm:row-start-1 sm:col-start-2")} aria-hidden>
                    <span className={cn("block h-full", r.tone === "bad" ? "bg-bad" : "bg-info/40")} style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
                  </span>
                  <span className={cn("row-start-1 text-right tabular-nums text-ink", !compact && "sm:col-start-3")}>{r.display}</span>
                </li>
              ));
            })()}
          </ul>
          {bars.link ? (
            <Link href={bars.link.href} className="mt-2 inline-block text-xs font-medium text-accent underline-offset-2 hover:underline dark:text-info">
              {bars.link.label}
            </Link>
          ) : null}
        </div>
      ) : null}

      {turn.proposal && onConfirm && onDismiss ? (
        <ProposalPlan
          proposal={turn.proposal}
          state={turn.proposalState}
          canConfirm={role === "admin"}
          busy={busy}
          compact={compact}
          onConfirm={onConfirm}
          onDismiss={onDismiss}
        />
      ) : null}

      {turn.engine?.kind === "local" ? (
        <p className="text-xs text-muted">The private local model wrote this answer, so it took longer. Client data stayed on Litch&apos;s server.</p>
      ) : null}

      <ProvenanceLine facts={facts} />

      {sources.length && compact ? <SourcesList sources={sources} answerId={id} variant="inline" className="border-t border-hairline pt-3" /> : null}
    </div>
  );

  return (
    <article
      aria-label="Sage's answer"
      className={cn(
        "rounded-card bg-paper shadow-[0_1px_2px_rgb(10_14_26/0.05),0_8px_24px_rgb(10_14_26/0.06)] dark:shadow-none dark:ring-1 dark:ring-hairline",
        !compact && sources.length && "md:grid md:grid-cols-[minmax(0,1fr)_220px]",
      )}
    >
      {main}
      {!compact && sources.length ? (
        <SourcesList
          sources={sources}
          answerId={id}
          variant="margin"
          className="border-t border-hairline bg-cloud px-5 py-4 md:rounded-r-card md:border-l md:border-t-0 md:px-4 md:py-5"
        />
      ) : null}
    </article>
  );
}

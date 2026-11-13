"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Lock } from "lucide-react";
import { Button } from "@/components/kit";
import { EDITABLE_PARAMS, letterOf, paramLabel, type ProposalState, type SageProposal } from "@/lib/sage/present";
import { cn } from "@/lib/utils";
import { PlanCheck } from "./check";

/**
 * "Needs your confirmation": a write Sage proposes, shown as a plan. Nothing
 * runs until a person confirms; the server re-checks the role and writes the
 * audit log. Staff (and any blocked proposal) see "Only an admin can do this"
 * with no confirm button.
 */
export function ProposalPlan({
  proposal,
  state,
  canConfirm,
  busy,
  onConfirm,
  onDismiss,
  compact = false,
}: {
  proposal: SageProposal;
  state: ProposalState | null | undefined;
  /** False for staff: the plan shows, the confirm path does not. */
  canConfirm: boolean;
  busy?: boolean;
  onConfirm: (p: SageProposal) => void;
  onDismiss: () => void;
  compact?: boolean;
}) {
  const [checked, setChecked] = useState(true);
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useState<Record<string, unknown>>(proposal.params ?? {});
  const editable = useMemo(
    () => EDITABLE_PARAMS.filter((k) => typeof proposal.params?.[k] === "string" || typeof proposal.params?.[k] === "number"),
    [proposal.params],
  );
  const current: SageProposal = { ...proposal, params };
  const letter = letterOf(current);
  const blocked = !canConfirm || state === "blocked";
  const settled = state === "confirmed" || state === "dismissed";
  const n = checked ? 1 : 0;

  if (blocked) {
    return (
      <section aria-label="Only an admin can do this" className="rounded-xl border border-hairline bg-surface p-3.5">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <Lock className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> Only an admin can do this
        </p>
        <p className="mt-1 text-[13px] text-body">{proposal.summary}</p>
        <p className="mt-1 text-xs text-muted">Nothing was changed. Ask an admin if it needs doing.</p>
      </section>
    );
  }

  return (
    <section aria-label="Needs your confirmation" className="overflow-hidden rounded-xl border border-warn/30">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-warn/30 bg-warn-soft px-3.5 py-2.5">
        <AlertTriangle className="size-4 text-warn" strokeWidth={1.5} aria-hidden />
        <span className="text-[13px] font-semibold text-warn">{settled ? (state === "confirmed" ? "Done" : "Dismissed") : "Needs your confirmation"}</span>
        <span className="ml-auto text-xs text-warn">{settled ? (state === "confirmed" ? "Logged in the audit log" : "Nothing was sent") : "Nothing is sent until you confirm"}</span>
      </div>
      <div className={cn("grid gap-4 bg-paper p-3.5", letter && !compact && "md:grid-cols-[230px_minmax(0,1fr)]")}>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-1 text-[12.5px] text-muted">Plan</legend>
          <PlanCheck checked={checked} onChange={setChecked} disabled={settled || busy}>
            {proposal.summary}
          </PlanCheck>
          {!proposal.ready ? <p className="mt-1 text-xs text-bad">Sage needs more details for this. Rephrase your request.</p> : null}
        </fieldset>
        {letter ? (
          <div className="min-w-0 rounded-ctl border border-hairline bg-cloud text-[13px]">
            <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-y-0.5 border-b border-hairline px-3 py-2 text-body">
              <span>To</span>
              <span className="truncate text-ink">{letter.to}</span>
              <span>Subject</span>
              <span className="truncate text-ink">{letter.subject}</span>
            </div>
            <p className="whitespace-pre-wrap px-3 py-2.5 leading-relaxed text-ink">{letter.body}</p>
          </div>
        ) : null}
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {editable.map((k) => (
              <label key={k} className={cn("block text-[13px]", (k === "body" || k === "description") && "sm:col-span-2")}>
                <span className="mb-1 block font-medium text-ink">{paramLabel(k)}</span>
                {k === "body" ? (
                  <textarea
                    value={String(params[k] ?? "")}
                    onChange={(e) => setParams((p) => ({ ...p, [k]: e.target.value }))}
                    rows={4}
                    className="w-full rounded-ctl border border-line-strong bg-paper px-3 py-2 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                ) : (
                  <input
                    value={String(params[k] ?? "")}
                    inputMode={k === "amount" ? "decimal" : undefined}
                    onChange={(e) => setParams((p) => ({ ...p, [k]: k === "amount" ? Number(e.target.value.replace(/[^\d.]/g, "")) || 0 : e.target.value }))}
                    className="h-10 w-full rounded-ctl border border-line-strong bg-paper px-3 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                )}
              </label>
            ))}
          </div>
        ) : null}
      </div>
      {settled ? (
        <p className="flex items-center gap-1.5 bg-paper px-3.5 pb-3.5 text-[13px] text-body">
          {state === "confirmed" ? <Check className="size-4 text-good" aria-hidden /> : null}
          {state === "confirmed" ? "Confirmed and applied." : "You dismissed this plan."}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 bg-paper px-3.5 pb-3.5">
          <Button variant="primary" size={compact ? "sm" : "md"} disabled={busy || !n || !proposal.ready} onClick={() => onConfirm(current)}>
            {busy ? "Confirming…" : `Confirm ${n} ${n === 1 ? "action" : "actions"}`}
          </Button>
          {editable.length ? (
            <Button size={compact ? "sm" : "md"} disabled={busy} onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              {editing ? "Done editing" : letter ? "Edit the message" : "Edit first"}
            </Button>
          ) : null}
          <Button variant="ghost" size={compact ? "sm" : "md"} disabled={busy} onClick={onDismiss}>
            Dismiss
          </Button>
          {!compact ? <span className="ml-auto text-xs text-muted">Logged in the audit log</span> : null}
        </div>
      )}
    </section>
  );
}

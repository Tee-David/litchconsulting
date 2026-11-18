"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import type { WbProvider } from "@/lib/litchai/workbench";
import { providersAction, setAiCapAction } from "@/lib/workbench/actions";
import { cn } from "@/lib/utils";

type Budget = NonNullable<WbProvider["budget"]>;

const usd = (n: number) => `$${n.toFixed(2)}`;

/** One bar: green under 70%, amber to 100%, red at or over the cap. */
function UsageBar({ label, pct, right, hint }: { label: string; pct: number | null; right: string; hint?: string }) {
  const p = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const tone = pct === null ? "bg-faint" : p >= 100 ? "bg-bad" : p >= 70 ? "bg-warn" : "bg-good";
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2 text-[12.5px]">
        <span className="font-medium text-ink">{label}</span>
        <span className="ml-auto tabular-nums text-body">{right}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct === null ? undefined : Math.round(p)}
        className="h-2 overflow-hidden rounded-full bg-cloud"
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${p}%` }} />
      </div>
      {hint ? <p className="mt-1 text-[11.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * DeepSeek usage as percentages: today against the daily cap, and the credit used
 * since the last top-up. The balance itself is never shown. Admins can change the
 * cap here; above it, Sage uses the free models until the next day.
 */
export function AiUsage({ canEdit, initial }: { canEdit: boolean; initial?: Budget | null }) {
  const [budget, setBudget] = useState<Budget | null | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial !== undefined) return;
    void providersAction(false).then((r) => {
      if (!r.ok) return setError(r.error);
      setBudget(r.chain.find((p) => p.name === "deepseek")?.budget ?? null);
    });
  }, [initial]);

  const save = async () => {
    const v = Number(draft);
    if (!Number.isFinite(v) || v < 0) return setError("Give an amount of $0 or more.");
    setSaving(true);
    const r = await setAiCapAction(v);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    setBudget(r.budget);
    setEditing(false);
    setError(null);
  };

  if (budget === undefined && !error) {
    return <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><Loader2 className="size-3.5 animate-spin" /> Loading usage…</p>;
  }
  if (budget === null) {
    return <p className="text-[12.5px] text-muted">DeepSeek is not set up, so there is no paid usage to track.</p>;
  }

  const today = budget && budget.spent_today !== null && budget.cap > 0 ? (budget.spent_today / budget.cap) * 100 : budget?.over ? 100 : null;
  return (
    <div className="space-y-3 rounded-card border border-hairline bg-surface px-3 py-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-ink">DeepSeek usage</p>
        {budget?.over ? <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-medium text-bad">Cap reached: free models answer</span> : null}
      </div>
      {budget ? (
        <>
          <UsageBar
            label="Today"
            pct={today}
            right={budget.spent_today === null ? "not known yet" : `${Math.round(today ?? 0)}% · ${usd(budget.spent_today)} of ${usd(budget.cap)}`}
            hint="Resets at 01:00 Lagos time (midnight UTC)."
          />
          <UsageBar
            label="Credit used since the last top-up"
            pct={budget.credit_used_pct}
            right={budget.credit_used_pct === null ? "not known yet" : `${budget.credit_used_pct.toFixed(1)}%`}
          />
        </>
      ) : null}
      {canEdit ? (
        editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label htmlFor="ai-cap" className="text-[12.5px] text-body">Daily cap (USD)</label>
            <input
              id="ai-cap"
              inputMode="decimal"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
              className="h-10 w-24 rounded-ctl border border-hairline bg-paper px-2 text-sm tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-accent"
            />
            <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-1 rounded-ctl bg-brand px-3 text-[13px] font-medium text-white keep-brand disabled:opacity-60">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-10 rounded-ctl px-2 text-[13px] text-muted hover:text-ink">Cancel</button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(String(budget?.cap ?? 1));
              setEditing(true);
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-ctl border border-hairline px-3 text-[13px] font-medium text-ink hover:bg-paper"
          >
            <Pencil className="size-3.5" aria-hidden /> Change the daily cap
          </button>
        )
      ) : (
        <p className="text-[11.5px] text-muted">An admin can change the daily cap in Settings → Integrations.</p>
      )}
      {error ? <p className="text-[12px] text-bad">{error}</p> : null}
    </div>
  );
}

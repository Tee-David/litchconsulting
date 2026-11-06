"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Cloud, Cpu, Loader2, Lock, RefreshCw, Sparkles, Zap } from "lucide-react";
import type { WbProvider } from "@/lib/litchai/workbench";
import { providersAction } from "@/lib/workbench/actions";
import { Button, Sheet } from "@/components/kit";
import { PROVIDER_LABEL } from "./turn";
import { cn } from "@/lib/utils";
import { engineLabel, slotLabel } from "@/lib/ai-words";

/**
 * What powers Sage, in order: the pipeline computes every number, the
 * decision layer makes small typed choices, the model plans and writes. The
 * provider chain is live (health + today's free quota), and the privacy mode
 * for this client is stated plainly.
 */
export function EngineSheet({
  open,
  onClose,
  local,
  provider,
  clientHref,
}: {
  open: boolean;
  onClose: () => void;
  local: boolean;
  provider: string | null;
  clientHref: string | null;
}) {
  const [chain, setChain] = useState<WbProvider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const load = async (probe: boolean) => {
    setProbing(probe);
    const res = await providersAction(probe);
    setProbing(false);
    if (res.ok) {
      setChain(res.chain);
      setError(null);
    } else setError(res.error);
  };

  useEffect(() => {
    if (open && !chain) void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = (chain ?? []).filter((p) => (local ? p.kind === "local" : true));

  return (
    <Sheet open={open} onClose={onClose} title="What powers Sage" description="Three layers, in this order." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-3">
        {[
          { icon: Cpu, cls: "bg-cloud text-body", t: "1 · Pipeline (on our server)", d: "Every number. Totals, checks, reconciliations and tax are computed from every row, formulas are written into the file, and LibreOffice recomputes the whole workbook before anything leaves." },
          { icon: Zap, cls: "bg-violet-soft text-violet", t: "2 · Decision layer", d: "Small typed choices: which tools to offer, whether a write is risky, local or cloud. Low confidence goes to you." },
          { icon: Sparkles, cls: "bg-good-soft text-good", t: "3 · Language model", d: "Plans the steps and writes the words. Never the source of a figure. Picked once per conversation and falls back in order." },
        ].map((l) => (
          <div key={l.t} className="flex gap-2.5">
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-ctl", l.cls)}><l.icon className="size-4" aria-hidden /></span>
            <div>
              <p className="text-sm font-semibold text-ink">{l.t}</p>
              <p className="text-[12.5px] text-body">{l.d}</p>
            </div>
          </div>
        ))}

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">Model chain{local ? " for this client" : ""}</p>
            <button type="button" onClick={() => void load(true)} disabled={probing} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-muted hover:bg-cloud hover:text-ink">
              {probing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Check now
            </button>
          </div>
          {error ? (
            <p className="text-[12.5px] text-bad">{error}</p>
          ) : !chain ? (
            <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><Loader2 className="size-3.5 animate-spin" /> Loading…</p>
          ) : (
            <ol className="flex flex-wrap items-stretch gap-1" aria-label="Model chain, in fallback order">
              {shown.map((p, i) => {
                const on = provider === p.name;
                const down = !p.configured || p.ok === false || Boolean(p.exhausted_until);
                const quota = p.daily_tokens ? Math.min(100, Math.round((p.used_tokens / p.daily_tokens) * 100)) : null;
                return (
                  <li key={p.name} className="flex items-center gap-1">
                    <div className={cn("min-w-[118px] rounded-ctl border px-2 py-1.5 text-[12px]", on ? "border-good bg-good-soft" : down ? "border-hairline bg-cloud opacity-70" : "border-hairline bg-surface")}>
                      <p className="font-semibold text-ink">{PROVIDER_LABEL[p.name] ?? slotLabel(p.name)}{on ? " · in use" : ""}</p>
                      <p className="truncate text-[11px] text-muted" title={p.model}>{p.model}</p>
                      <p className={cn("text-[11px]", down ? "text-warn" : "text-good")}>
                        {!p.configured ? "No key" : p.exhausted_until ? "Daily limit reached" : p.ok === false ? `Down (${p.detail})` : p.ok ? "Healthy" : "Not checked"}
                        {quota !== null && p.configured ? ` · ${quota}% of free quota` : ""}
                      </p>
                    </div>
                    {i < shown.length - 1 ? <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden /> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className={cn("rounded-card border px-3 py-2.5 text-[12.5px]", local ? "border-violet/30 bg-violet-soft" : "border-hairline bg-surface")}>
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            {local ? <Lock className="size-3.5" aria-hidden /> : <Cloud className="size-3.5" aria-hidden />}
            {engineLabel(local ? "local" : "cloud")}
          </p>
          <p className="mt-0.5 text-body">
            {local
              ? "Nothing about this client leaves our server. Sage uses the local model, which is slower."
              : "Cloud models see the workbook's shape, totals and masked samples only. Names, account numbers, phone numbers, emails, BVNs and TINs become tokens such as [NAME_1] before anything leaves; real values are put back only in what you see."}
          </p>
          <p className="mt-1 text-muted">
            Set per client on the client&rsquo;s Privacy tab{clientHref ? <> (<a href={clientHref} className="text-accent underline">open it</a>)</> : null}. Text inside client files is treated as data, never as instructions.
          </p>
        </div>
      </div>
    </Sheet>
  );
}

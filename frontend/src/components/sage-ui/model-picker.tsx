"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Cpu, Loader2 } from "lucide-react";
import type { WbProvider } from "@/lib/litchai/workbench";
import { providersAction } from "@/lib/workbench/actions";
import { PROVIDER_LABEL } from "@/components/workbench/turn";
import { slotLabel } from "@/lib/ai-words";
import { cn } from "@/lib/utils";

/** Per viewer: the model Sage chat tries first ("" = the firm's default chain). */
export const SAGE_MODEL_KEY = "litch.sage.model";

export function readSageModel(): string {
  try {
    return window.localStorage.getItem(SAGE_MODEL_KEY) ?? "";
  } catch {
    return "";
  }
}

const label = (name: string) => PROVIDER_LABEL[name.split(":")[0]] ?? slotLabel(name);

/** A small menu next to the mic: pick the model Sage uses first. */
export function ModelPicker() {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState("");
  const [chain, setChain] = useState<WbProvider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setModel(readSageModel()), []);

  useEffect(() => {
    if (!open) return;
    if (!chain) {
      void providersAction(false).then((r) => (r.ok ? setChain(r.chain) : setError(r.error)));
    }
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open, chain]);

  const pick = (name: string) => {
    setModel(name);
    try {
      window.localStorage.setItem(SAGE_MODEL_KEY, name);
    } catch {
      /* private window: the choice lasts for this page only */
    }
    setOpen(false);
  };

  const options = [
    { name: "", title: "Default", sub: "The firm's chain, first available" },
    ...(chain ?? [])
      .filter((p) => p.kind === "cloud" && p.configured)
      .map((p) => ({ name: p.name, title: label(p.name), sub: p.model + (p.ok === false || p.exhausted_until ? " · busy now" : "") })),
  ];
  const current = model ? label(model) : "Default model";

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Model: ${current}. Change the model`}
        title={`Model: ${current}`}
        className={cn("grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-cloud hover:text-ink focus-visible:outline-2 focus-visible:outline-accent", model && "text-accent")}
      >
        <Cpu className="size-4" aria-hidden />
      </button>
      {open ? (
        <div role="menu" aria-label="Model Sage uses first" className="absolute bottom-11 right-0 z-30 w-64 rounded-card border border-hairline bg-surface p-1 shadow-lg">
          <p className="px-2 pb-1 pt-1.5 text-[11.5px] text-muted">Sage tries this model first. If it is busy, the chain takes over.</p>
          {error ? <p className="px-2 py-1.5 text-[12px] text-bad">{error}</p> : null}
          {!chain && !error ? (
            <p className="flex items-center gap-1.5 px-2 py-2 text-[12px] text-muted"><Loader2 className="size-3.5 animate-spin" /> Loading models…</p>
          ) : (
            options.map((o) => (
              <button
                key={o.name || "default"}
                type="button"
                role="menuitemradio"
                aria-checked={model === o.name}
                onClick={() => pick(o.name)}
                className="flex min-h-11 w-full items-center gap-2 rounded-ctl px-2 py-1.5 text-left hover:bg-cloud focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-ink">{o.title}</span>
                  <span className="block truncate text-[11px] text-muted" title={o.sub}>{o.sub}</span>
                </span>
                {model === o.name ? <Check className="size-4 shrink-0 text-good" aria-hidden /> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

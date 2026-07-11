"use client";

import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CALC_CATEGORIES, CALCULATORS } from "./registry";

export function CalculatorHub({ onSelect, isAdmin = false }: { onSelect: (key: string) => void; isAdmin?: boolean }) {
  const [tab, setTab] = useState<string>("all");
  const [q, setQ] = useState("");

  const baseCalculators = isAdmin
    ? CALCULATORS
    : CALCULATORS.filter((c) => c.key === "paye" || c.key === "pension");

  const filtered = baseCalculators.filter(
    (c) =>
      (!isAdmin || tab === "all" || c.category === tab) &&
      (q === "" ||
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.blurb.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {["all", ...CALC_CATEGORIES].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  tab === t
                    ? "bg-brand text-white keep-brand"
                    : "border border-hairline text-body hover:bg-surface hover:text-ink",
                )}
              >
                {t === "all" ? "All" : t}
              </button>
            ))}
          </div>
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search calculators…"
              className="h-9 w-full rounded-full border border-hairline bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelect(c.key)}
            className="group flex items-start gap-4 rounded-2xl border border-hairline bg-paper p-5 text-left transition-all hover:border-brand/40 hover:shadow-lg hover:shadow-black/5"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand keep-brand dark:bg-white/10 dark:text-white">
              <c.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-display text-[0.95rem] font-bold text-ink">
                {c.name}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-body">{c.blurb}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand dark:text-highlight">
                Open
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted">No calculators match.</p>
        )}
      </div>
    </div>
  );
}

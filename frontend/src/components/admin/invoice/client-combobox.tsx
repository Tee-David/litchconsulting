"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Check, Users } from "lucide-react";
import type { ClientRow } from "@/lib/db/queries/clients";
import { cn } from "@/lib/utils";

/** Searchable "Bill to" client picker (combobox). */
export function ClientCombobox({
  clients,
  value,
  onPick,
}: {
  clients: ClientRow[];
  value: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = clients.find((c) => c.id === value);
  const label = value ? selected?.company || selected?.name || "Client" : "Select or enter manually";
  const q = query.trim().toLowerCase();
  const filtered = clients.filter(
    (c) => !q || `${c.company ?? ""} ${c.name ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q),
  );

  function choose(id: string) {
    onPick(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
      >
        <span className={value ? "truncate text-ink" : "text-muted"}>{label}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-hairline bg-paper shadow-xl shadow-black/10">
          <div className="border-b border-hairline p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients…"
                className="h-9 w-full rounded-lg border border-hairline bg-surface pl-8 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
              />
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto p-1">
            <li>
              <button
                type="button"
                onClick={() => choose("")}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-body transition-colors hover:bg-surface"
              >
                — Enter manually —
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-sm text-muted">No clients found</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => choose(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface",
                      value === c.id && "bg-surface",
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                      <Users className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{c.company || c.name}</p>
                      {c.email && <p className="truncate text-xs text-muted">{c.email}</p>}
                    </div>
                    {value === c.id && <Check className="size-4 shrink-0 text-brand" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

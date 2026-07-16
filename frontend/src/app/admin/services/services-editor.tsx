"use client";

import { useState, useTransition } from "react";
import { ChevronDown, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import { Badge } from "@/components/admin/ui/badge";
import { formatMoney } from "@/lib/invoice/money";
import type { RequiredDocument } from "@/lib/services/catalog";
import { saveOfferingAction } from "./actions";

export type OfferingRow = {
  slug: string;
  name: string;
  tagline: string;
  active: boolean;
  pricingMode: "fixed" | "quote";
  priceNgn: string | null;
  taxRate: string;
  turnaround: string | null;
  requiredDocuments: RequiredDocument[];
  sortOrder: number;
};

const inputCls =
  "w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

function OfferingCard({ initial }: { initial: OfferingRow }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState(initial);

  function patch(p: Partial<OfferingRow>) {
    setRow((r) => ({ ...r, ...p }));
  }

  function patchDoc(i: number, p: Partial<RequiredDocument>) {
    setRow((r) => ({
      ...r,
      requiredDocuments: r.requiredDocuments.map((d, j) => (j === i ? { ...d, ...p } : d)),
    }));
  }

  function save() {
    startTransition(async () => {
      const res = await saveOfferingAction({
        slug: row.slug,
        active: row.active,
        pricingMode: row.pricingMode,
        priceNgn: row.priceNgn,
        taxRate: row.taxRate,
        turnaround: row.turnaround,
        requiredDocuments: row.requiredDocuments,
        sortOrder: row.sortOrder,
      });
      if (!res.ok) return toast.error(res.error || "Could not save");
      toast.success(`${row.name} saved`);
    });
  }

  return (
    <div className="rounded-card border border-hairline bg-paper">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <GripVertical className="size-4 shrink-0 text-muted" />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold text-ink">{row.name}</p>
            <p className="truncate text-xs text-muted">{row.tagline}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!row.active && <Badge tone="danger">hidden</Badge>}
          <Badge tone={row.pricingMode === "fixed" ? "brand" : "neutral"}>
            {row.pricingMode === "fixed" && row.priceNgn
              ? formatMoney(Number(row.priceNgn))
              : "quote"}
          </Badge>
          <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-hairline p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-body">Pricing mode</span>
              <div className="flex gap-1 rounded-full border border-hairline p-1">
                {(["fixed", "quote"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => patch({ pricingMode: m })}
                    className={cn(
                      "flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      row.pricingMode === m
                        ? "bg-brand text-white keep-brand"
                        : "text-muted hover:text-ink"
                    )}
                  >
                    {m === "fixed" ? "Fixed price" : "Quote"}
                  </button>
                ))}
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-body">
                Price (₦, before VAT)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={row.priceNgn ?? ""}
                onChange={(e) => patch({ priceNgn: e.target.value || null })}
                disabled={row.pricingMode !== "fixed"}
                placeholder={row.pricingMode === "fixed" ? "e.g. 250000" : "n/a (quote)"}
                className={cn(inputCls, "disabled:opacity-50")}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-body">VAT rate (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={row.taxRate}
                onChange={(e) => patch({ taxRate: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-body">Typical turnaround</span>
              <input
                value={row.turnaround ?? ""}
                onChange={(e) => patch({ turnaround: e.target.value || null })}
                placeholder="e.g. 3–5 business days"
                className={inputCls}
              />
            </label>
          </div>

          {/* Required documents builder */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-body">
                Documents the client uploads after payment
              </span>
              <button
                type="button"
                onClick={() =>
                  patch({
                    requiredDocuments: [
                      ...row.requiredDocuments,
                      {
                        key: `doc-${row.requiredDocuments.length + 1}-${Date.now() % 1000}`,
                        label: "",
                        required: true,
                      },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                <Plus className="size-3.5" /> Add document
              </button>
            </div>
            {row.requiredDocuments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-hairline px-4 py-3 text-xs text-muted">
                No documents required — paid requests skip straight to “in progress”.
              </p>
            ) : (
              <ul className="space-y-2">
                {row.requiredDocuments.map((d, i) => (
                  <li key={d.key} className="flex items-center gap-2">
                    <input
                      value={d.label}
                      onChange={(e) => patchDoc(i, { label: e.target.value })}
                      placeholder='e.g. "Bank statements (last 12 months)"'
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => patchDoc(i, { required: !d.required })}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                        d.required
                          ? "border-brand/40 bg-brand-tint text-brand"
                          : "border-hairline text-muted"
                      )}
                    >
                      {d.required ? "Required" : "Optional"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          requiredDocuments: row.requiredDocuments.filter((_, j) => j !== i),
                        })
                      }
                      className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-hairline pt-4">
            <label className="flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                checked={row.active}
                onChange={(e) => patch({ active: e.target.checked })}
                className="size-4 rounded border-hairline accent-[var(--color-brand)]"
              />
              Visible on the site
            </label>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60 keep-brand"
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ServicesEditor({ offerings }: { offerings: OfferingRow[] }) {
  return (
    <div className="space-y-3">
      {offerings.map((o) => (
        <OfferingCard key={o.slug} initial={o} />
      ))}
    </div>
  );
}

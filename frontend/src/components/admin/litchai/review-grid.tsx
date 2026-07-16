"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import { DataTable } from "@/components/admin/ui/data-table";
import { useToast } from "@/components/admin/ui/toaster";
import type { FigureLineage, LineItem, QueueEntry, TaxonomyCategory } from "@/lib/litchai/client";
import { recategorize } from "@/app/admin/litchai/actions";

/**
 * Risk-ordered review grid. Reuses the admin DataTable; the category cell is an
 * inline <select> that recategorizes through the server action (which dual-writes
 * the correction so the ladder learns it). Explain-only, corrections-only (v1).
 */
export function ReviewGrid({
  documentId,
  lineItems,
  queue,
  lineage,
  categories,
}: {
  documentId: number;
  lineItems: LineItem[];
  queue: QueueEntry[];
  lineage: FigureLineage[];
  categories: TaxonomyCategory[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<number | null>(null);

  const riskById = useMemo(() => new Map(queue.map((q) => [q.line_item_id, q.risk])), [queue]);
  const rows = useMemo(
    () => [...lineItems].sort((a, b) => (riskById.get(b.id) ?? 0) - (riskById.get(a.id) ?? 0)),
    [lineItems, riskById],
  );

  function onChangeCategory(lineItemId: number, newCode: string, current: string | null) {
    if (!newCode || newCode === current) return;
    setSavingId(lineItemId);
    startTransition(async () => {
      const res = await recategorize(documentId, lineItemId, newCode);
      setSavingId(null);
      if (res.ok) {
        toast.success("Recategorized — the ladder will remember this.");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to recategorize.");
      }
    });
  }

  const columns = useMemo<ColumnDef<LineItem, unknown>[]>(
    () => [
      {
        accessorKey: "raw_text",
        header: "Narration",
        cell: ({ row }) => {
          const li = row.original;
          return (
            <div className="min-w-0">
              <span className="font-medium text-ink">{li.raw_text}</span>
              {li.sheet_ref && <p className="text-xs text-muted">{li.sheet_ref}</p>}
              {li.flags.length > 0 && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3" />
                  {li.flags.join(", ")}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => {
          const li = row.original;
          const sign = li.direction === "out" ? "-" : "";
          return (
            <span className={li.direction === "out" ? "text-body" : "text-emerald-600 dark:text-emerald-400"}>
              {sign}₦{li.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          );
        },
      },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => {
          const li = row.original;
          return (
            <select
              defaultValue={li.category_code ?? ""}
              disabled={pending && savingId === li.id}
              onChange={(e) => onChangeCategory(li.id, e.target.value, li.category_code)}
              className="max-w-[15rem] rounded-lg border border-hairline bg-paper px-2 py-1 text-sm text-ink"
            >
              {!li.category_code && <option value="">— uncategorized —</option>}
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          );
        },
      },
      {
        accessorKey: "category_source",
        header: "Source",
        cell: ({ getValue }) => <span className="text-xs text-muted">{(getValue() as string) ?? "—"}</span>,
      },
      {
        id: "risk",
        header: "Risk",
        cell: ({ row }) => {
          const risk = riskById.get(row.original.id) ?? 0;
          return <span className="tabular-nums text-body">{risk.toLocaleString()}</span>;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, pending, savingId, riskById],
  );

  return (
    <div className="space-y-6">
      {lineage.length > 0 && (
        <div className="rounded-card border border-hairline bg-surface/50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Figure lineage</h3>
          <ul className="space-y-1 text-sm text-body">
            {lineage.map((f) => (
              <li key={f.figure}>
                <span className="font-medium text-ink">{f.figure}</span> ← {f.item_count} items:{" "}
                {Object.entries(f.by_source)
                  .map(([src, n]) => `${n} ${src}`)
                  .join(" / ")}
                {f.min_confidence !== null && `, min conf ${f.min_confidence.toFixed(2)}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search narrations…"
        getRowId={(li) => String(li.id)}
      />
    </div>
  );
}

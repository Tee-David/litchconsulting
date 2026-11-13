"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button, ConfirmSheet, DataTable, EmptyState, type BulkAction, type TableView } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { purgeTrashAction, restoreTrashAction } from "./actions";

export type TrashItem = { key: string; type: "client" | "request" | "invoice" | "ticket"; id: string; name: string; sub: string; deletedAt: string; movedBy: string | null };

const TYPE_LABEL: Record<TrashItem["type"], string> = { client: "Client", request: "Request", invoice: "Invoice or quote", ticket: "Support ticket" };
const daysLeft = (iso: string) => Math.max(0, 30 - Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export function TrashList({ items }: { items: TrashItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [purge, setPurge] = useState<TrashItem[] | null>(null);

  const columns = useMemo<ColumnDef<TrashItem, unknown>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Item",
        meta: { label: "Item", mobile: "title", hideable: false },
        cell: ({ row: { original: t } }) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-ink">{t.name}</span>
            <span className="block truncate text-xs text-muted">
              {TYPE_LABEL[t.type]}
              {t.sub ? ` · ${t.sub}` : ""}
            </span>
          </span>
        ),
      },
      {
        id: "deletedAt",
        accessorKey: "deletedAt",
        header: "Moved to Trash",
        meta: { label: "Moved to Trash", mobile: "meta" },
        cell: ({ row }) => <span className="text-body">{new Date(row.original.deletedAt).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" })}</span>,
      },
      {
        id: "movedBy",
        accessorFn: (t) => t.movedBy ?? "",
        header: "Moved by",
        meta: { label: "Moved by" },
        // Rows trashed before this column existed have no name.
        cell: ({ row }) => <span className="text-body">{row.original.movedBy || "—"}</span>,
      },
      {
        id: "left",
        accessorFn: (t) => daysLeft(t.deletedAt),
        header: "Deleted in",
        meta: { label: "Deleted in", mobile: "badge" },
        cell: ({ row }) => {
          const d = daysLeft(row.original.deletedAt);
          return d <= 5 ? <span className="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">{d} {d === 1 ? "day" : "days"}</span> : <span className="text-body">{d} days</span>;
        },
      },
    ],
    [],
  );

  const restore = async (sel: TrashItem[]) => {
    const r = await restoreTrashAction(sel.map(({ type, id }) => ({ type, id })));
    if (!r.ok) {
      toast.error(r.error);
      throw new Error(r.error);
    }
    toast.success(r.message);
    router.refresh();
  };

  const views: TableView<TrashItem>[] = [
    { id: "all", label: "All", predicate: () => true },
    { id: "soon", label: "Deleted within 5 days", predicate: (t) => daysLeft(t.deletedAt) <= 5 },
    ...(["client", "request", "invoice", "ticket"] as const).map((ty) => ({ id: ty, label: TYPE_LABEL[ty], predicate: (t: TrashItem) => t.type === ty })),
  ];
  const bulk: BulkAction<TrashItem>[] = [
    { id: "restore", label: "Restore", icon: <RotateCcw className="size-4" />, run: restore },
    { id: "purge", label: "Delete permanently", icon: <Trash2 className="size-4" />, tone: "danger", run: (sel) => setPurge(sel) },
  ];

  return (
    <>
      {items.length > 0 && (
        <div className="mb-3 flex justify-end">
          <Button variant="danger" size="sm" onClick={() => setPurge(items)}>
            <Trash2 className="size-4" /> Empty Trash…
          </Button>
        </div>
      )}
      <DataTable
        label="Trash"
        storageKey="admin-trash"
        columns={columns}
        data={items}
        getRowId={(t) => t.key}
        views={views}
        bulkActions={bulk}
        searchPlaceholder="Search Trash"
        searchText={(t) => `${t.name} ${t.sub} ${t.movedBy ?? ""}`}
        emptyState={<EmptyState icon={<Trash2 />} title="Trash is empty" why="Deleted clients, requests, invoices and tickets wait here for 30 days, so a mistake is never final." />}
      />
      <ConfirmSheet
        open={purge !== null}
        onClose={() => setPurge(null)}
        tone="danger"
        title={`Delete ${purge?.length ?? 0} for good?`}
        confirmLabel="Delete permanently"
        typeToConfirm="delete"
        body={<p>This cannot be undone. Invoices with money paid on them are kept, because tax law needs them.</p>}
        onConfirm={async () => {
          const r = await purgeTrashAction((purge ?? []).map(({ type, id }) => ({ type, id })));
          if (!r.ok) throw new Error(r.error);
          toast.success(r.message);
          router.refresh();
        }}
      />
    </>
  );
}

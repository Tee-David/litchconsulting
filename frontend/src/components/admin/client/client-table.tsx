"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Download, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { DataTable, EmptyState, type BulkAction, type TableView } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney } from "@/lib/invoice/money";
import { bulkDeleteClients, restoreClients } from "@/app/admin/clients/actions";
import type { ClientRowLite } from "@/app/admin/_lib/clients-data";
import { downloadCsv } from "@/components/admin/ui/csv";

const ago = (iso: string) => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export function AiModeTag({ mode }: { mode: string }) {
  return mode === "local_only" ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-soft px-2 py-0.5 text-xs font-medium text-violet">
      <Lock className="size-3" /> Local only
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-body">
      <ShieldCheck className="size-3" /> Cloud, masked
    </span>
  );
}

export function ClientTable({ rows }: { rows: ClientRowLite[] }) {
  const router = useRouter();
  const toast = useToast();

  const columns = useMemo<ColumnDef<ClientRowLite, unknown>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Client",
        meta: { label: "Client", mobile: "title", hideable: false },
        cell: ({ row: { original: c } }) => (
          <span className="block min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-semibold text-ink">{c.name}</span>
              {c.erasureRequestedAt ? (
                <span className="shrink-0 rounded-full bg-bad-soft px-1.5 text-[11px] font-semibold leading-5 text-bad">Erasure pending</span>
              ) : null}
            </span>
            <span className="block truncate text-xs text-muted">{c.contact ?? c.email ?? "No contact"}</span>
          </span>
        ),
      },
      { id: "taxId", accessorKey: "taxId", header: "TIN", meta: { label: "TIN", mobile: "hidden" }, cell: ({ row }) => <span className="tabular-nums text-body">{row.original.taxId || "—"}</span> },
      { id: "openRequests", accessorKey: "openRequests", header: "Open requests", meta: { label: "Open requests", align: "right", mobile: "meta" }, cell: ({ row }) => <span className="tabular-nums">{row.original.openRequests}</span> },
      { id: "billed12m", accessorKey: "billed12m", header: "Billed, 12 months", meta: { label: "Billed, 12 months", align: "right", mobile: "hidden" }, cell: ({ row }) => <span className="tabular-nums text-body">{formatMoney(row.original.billed12m)}</span> },
      {
        id: "owes",
        accessorKey: "owes",
        header: "Owes",
        meta: { label: "Owes", align: "right", mobile: "meta" },
        cell: ({ row: { original: c } }) =>
          c.owes > 0 ? (
            <span className="tabular-nums">
              <b className="text-ink">{formatMoney(c.owes)}</b>
              {c.late > 0 ? <span className="block text-xs text-bad">{formatMoney(c.late)} late</span> : null}
            </span>
          ) : (
            <span className="text-muted">₦0</span>
          ),
      },
      { id: "aiMode", accessorKey: "aiMode", header: "AI mode", meta: { label: "AI mode", mobile: "badge" }, cell: ({ row }) => <AiModeTag mode={row.original.aiMode} /> },
      { id: "lastActivity", accessorKey: "lastActivity", header: "Last activity", meta: { label: "Last activity", mobile: "meta" }, cell: ({ row }) => <span className="whitespace-nowrap text-body">{ago(row.original.lastActivity)}</span> },
    ],
    [],
  );

  const views: TableView<ClientRowLite>[] = [
    { id: "active", label: "Active", predicate: (c) => c.openRequests > 0 },
    { id: "owing", label: "Owing", predicate: (c) => c.owes > 0 },
    { id: "local", label: "Local-only AI", predicate: (c) => c.aiMode === "local_only" },
    { id: "erasure", label: "Erasure pending", predicate: (c) => c.erasureRequestedAt !== null },
    { id: "all", label: "All", predicate: () => true },
  ];

  const bulk: BulkAction<ClientRowLite>[] = [
    {
      id: "csv",
      label: "Export CSV",
      icon: <Download className="size-4" />,
      run: (sel) =>
        downloadCsv(
          "clients",
          ["Client", "Contact", "Email", "TIN", "Open requests", "Billed 12 months", "Owes", "Late", "AI mode", "Portal account"],
          sel.map((c) => [c.name, c.contact ?? "", c.email ?? "", c.taxId ?? "", c.openRequests, c.billed12m, c.owes, c.late, c.aiMode, c.hasPortal ? "yes" : "no"]),
        ),
    },
    {
      id: "trash",
      label: "Move to Trash",
      icon: <Trash2 className="size-4" />,
      tone: "danger",
      confirm: (sel) => `Move ${sel.length} ${sel.length === 1 ? "client" : "clients"} to Trash? Their records stay until Trash is emptied (30 days). Permanent erasure lives in each client's Privacy tab.`,
      run: async (sel) => {
        const ids = sel.map((c) => c.id);
        const r = await bulkDeleteClients(ids);
        if (!r.ok) {
          toast.error(r.error ?? "That did not work.");
          throw new Error(r.error);
        }
        toast.action(`${ids.length} moved to Trash.`, {
          label: "Undo",
          onAction: async () => {
            const u = await restoreClients(ids);
            if (u.ok) router.refresh();
            else toast.error(u.error ?? "Could not restore.");
          },
        });
        router.refresh();
      },
    },
  ];

  return (
    <div data-tour="clients-table">
      <DataTable
        label="Clients"
        storageKey="admin-clients"
        columns={columns}
        data={rows}
        getRowId={(c) => c.id}
        views={views}
        urlState
        searchPlaceholder="Search name, TIN, contact or email"
        searchText={(c) => `${c.name} ${c.contact ?? ""} ${c.email ?? ""} ${c.taxId ?? ""}`}
        bulkActions={bulk}
        rowHref={(c) => `/admin/clients/${c.id}`}
        emptyState={<EmptyState icon={<Building2 />} title="No clients yet" why="Clients appear when someone signs up and requests a service, or when you add one." />}
        noMatchState={<EmptyState compact title="Nothing matches" why="Try the All view or another search." />}
      />
    </div>
  );
}

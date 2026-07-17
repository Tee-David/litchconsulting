"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2, Users, Loader2 } from "lucide-react";
import { DataTable } from "@/components/admin/ui/data-table";
import { ExportMenu } from "@/components/admin/ui/export-menu";
import { useToast } from "@/components/admin/ui/toaster";
import type { Client } from "@/lib/db/schema";
import { bulkDeleteClients } from "@/app/admin/clients/actions";

export function ClientList({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Client[]>([]);
  const [busy, setBusy] = useState(false);

  const columns = useMemo<ColumnDef<Client, unknown>[]>(
    () => [
      {
        id: "name",
        // The cell leads with the company, so the global filter has to see it
        // too — an `accessorKey: "name"` would search only the contact and
        // silently miss every client you'd look up by their company name.
        accessorFn: (c) => [c.company, c.name].filter(Boolean).join(" "),
        header: "Client / Company",
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div>
              <span className="font-semibold text-ink">{c.company || c.name}</span>
              {c.company && c.name && <p className="text-xs text-muted">{c.name}</p>}
            </div>
          );
        },
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        accessorKey: "taxId",
        header: "Tax ID",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
    ],
    [],
  );

  const exportColumns = [
    { header: "Name", accessor: (c: Client) => c.name },
    { header: "Company", accessor: (c: Client) => c.company || "" },
    { header: "Email", accessor: (c: Client) => c.email || "" },
    { header: "Phone", accessor: (c: Client) => c.phone || "" },
    { header: "Tax ID", accessor: (c: Client) => c.taxId || "" },
  ];

  return (
    <div className="space-y-4">
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/20 bg-brand/5 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <Users className="size-4 text-brand" />
            <span>{selected.length} clients selected</span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (confirm(`Delete ${selected.length} selected clients?`)) {
                setBusy(true);
                const ids = selected.map((c) => c.id);
                const res = await bulkDeleteClients(ids);
                setBusy(false);
                if (res.ok) {
                  toast.success("Clients deleted.");
                  router.refresh();
                } else {
                  toast.error(res.error || "Failed to delete clients.");
                }
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100/50 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 cursor-pointer"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Delete Selected
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={clients}
        searchPlaceholder="Search clients…"
        onRowClick={(r) => router.push(`/admin/clients/${r.id}`)}
        enableSelection={true}
        onSelectionChange={setSelected}
        getRowId={(r) => r.id}
        toolbar={
          <ExportMenu rows={clients} columns={exportColumns} filename="clients" title="Clients" />
        }
      />
    </div>
  );
}

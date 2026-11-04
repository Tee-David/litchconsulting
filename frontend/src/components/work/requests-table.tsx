"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Download, Inbox, Send } from "lucide-react";
import { DataTable, EmptyState, StatusChip } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { sendReminderAction } from "@/app/work/actions";
import type { StaffRequestRow } from "@/lib/requests/work";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short" }) : "");
const NEXT: Record<string, string> = {
  quote_requested: "Waiting for the quote",
  quote_sent: "Client accepts the quote",
  pending_payment: "Client pays",
  awaiting_documents: "Client uploads documents",
  in_progress: "Do the work, send a draft",
  in_review: "Finish the internal review",
  client_review: "Client reviews the draft",
  delivered: "Client confirms",
  completed: "Done",
};

const columns: ColumnDef<StaffRequestRow, unknown>[] = [
  {
    id: "request",
    header: "Request",
    accessorFn: (r) => r.client,
    meta: { mobile: "title", hideable: false },
    cell: ({ row: { original: r } }) => (
      <span className="block">
        <span className="block font-medium text-ink">{r.client}</span>
        <span className="block text-xs text-muted">{r.number} · {r.serviceName}</span>
      </span>
    ),
  },
  { id: "status", header: "Status", accessorFn: (r) => r.status, meta: { mobile: "badge" }, cell: ({ getValue }) => <StatusChip domain="request" status={getValue() as string} /> },
  {
    id: "next",
    header: "Next step",
    accessorFn: (r) => (r.supplied ? `Check ${r.supplied} supplied ${r.supplied === 1 ? "item" : "items"}` : NEXT[r.status] ?? "Closed"),
    meta: { mobile: "subtitle" },
  },
  { id: "due", header: "Client due", accessorFn: (r) => r.nextDue ?? "", meta: { mobile: "meta" }, cell: ({ row: { original: r } }) => fmt(r.nextDue) },
  { id: "payment", header: "Payment", accessorFn: (r) => r.payment, meta: { mobile: "meta" }, cell: ({ getValue }) => <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-body">{getValue() as string}</span> },
  { id: "updated", header: "Updated", accessorFn: (r) => r.updatedAt, meta: { defaultHidden: true }, cell: ({ getValue }) => fmt(getValue() as string) },
];

function toCsv(rows: StaffRequestRow[]) {
  const head = ["Reference", "Client", "Service", "Status", "Payment", "Client due"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [head, ...rows.map((r) => [r.number, r.client, r.serviceName, r.status, r.payment, r.nextDue?.slice(0, 10) ?? ""])].map((l) => l.map(esc).join(",")).join("\n");
}

/** Assigned requests only (server-filtered), payment as a label, never an amount. */
export function StaffRequestsTable({ rows }: { rows: StaffRequestRow[] }) {
  const toast = useToast();
  return (
    <DataTable
      label="My requests"
      storageKey="work-requests"
      urlState
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `/work/requests/${r.id}`}
      searchPlaceholder="Search your requests"
      searchText={(r) => `${r.client} ${r.number} ${r.serviceName}`}
      initialSort={[{ id: "updated", desc: true }]}
      views={[
        { id: "us", label: "Needs me", predicate: (r) => r.turn === "us" },
        { id: "client", label: "Waiting on client", predicate: (r) => r.turn === "client" },
        { id: "open", label: "All open", predicate: (r) => r.turn !== "done" },
        { id: "all", label: "All mine", predicate: () => true },
      ]}
      bulkActions={[
        {
          id: "remind",
          label: "Send reminder",
          icon: <Send className="size-4" />,
          confirm: (rs) => `Email a reminder to the client on ${rs.length} ${rs.length === 1 ? "request" : "requests"}?`,
          run: async (rs) => {
            const r = await sendReminderAction(rs.map((x) => x.id));
            if (r.ok) toast.success(r.message ?? "Reminders sent");
            else {
              toast.error(r.error);
              throw new Error(r.error);
            }
          },
        },
        {
          id: "csv",
          label: "Export CSV",
          icon: <Download className="size-4" />,
          run: (rs) => {
            const url = URL.createObjectURL(new Blob([toCsv(rs)], { type: "text/csv" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "my-requests.csv";
            a.click();
            URL.revokeObjectURL(url);
          },
        },
      ]}
      emptyState={<EmptyState icon={<Inbox />} title="No requests assigned to you" why="An admin assigns requests. Ask them to add you to the ones you are working on." />}
    />
  );
}

"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Inbox } from "lucide-react";
import { DataTable, EmptyState, StatusChip } from "@/components/kit";

export type ClientReqRow = {
  id: string;
  number: string;
  serviceName: string;
  status: string;
  team: string;
  createdAt: string;
  updatedAt: string;
  parentNumber: string | null;
  yourMove: boolean;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" });
const CLOSED = ["completed", "cancelled", "declined", "refunded"];

const columns: ColumnDef<ClientReqRow, unknown>[] = [
  {
    id: "request",
    header: "Request",
    accessorFn: (r) => r.serviceName,
    meta: { mobile: "title", hideable: false },
    cell: ({ row: { original: r } }) => (
      <span className="block min-w-0">
        <span className="block font-medium text-ink">{r.serviceName}</span>
        <span className="block text-xs text-muted">
          {r.number}
          {r.parentNumber ? ` · follow-on to ${r.parentNumber}` : ""}
        </span>
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (r) => r.status,
    meta: { mobile: "badge" },
    cell: ({ getValue }) => <StatusChip domain="request" status={getValue() as string} audience="client" />,
  },
  { id: "team", header: "With", accessorFn: (r) => r.team || "Litch team", meta: { mobile: "meta" } },
  { id: "updated", header: "Last update", accessorFn: (r) => r.updatedAt, meta: { mobile: "meta" }, cell: ({ getValue }) => fmt(getValue() as string) },
  { id: "created", header: "Requested", accessorFn: (r) => r.createdAt, meta: { defaultHidden: true }, cell: ({ getValue }) => fmt(getValue() as string) },
];

export function ClientRequestsTable({ rows }: { rows: ClientReqRow[] }) {
  return (
    <DataTable
      label="Your requests"
      storageKey="client-requests"
      urlState
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `/dashboard/requests/${r.id}`}
      searchPlaceholder="Search by service or reference"
      searchText={(r) => `${r.serviceName} ${r.number} ${r.team}`}
      initialSort={[{ id: "updated", desc: true }]}
      views={[
        { id: "open", label: "Open", predicate: (r) => !CLOSED.includes(r.status) },
        { id: "mine", label: "Your move", predicate: (r) => r.yourMove },
        { id: "closed", label: "Closed", predicate: (r) => CLOSED.includes(r.status) },
        { id: "all", label: "All", predicate: () => true },
      ]}
      emptyState={
        <EmptyState
          icon={<Inbox />}
          title="No requests yet"
          why="Each request tracks one piece of work: quote, payment, documents, drafts and final files."
          action={
            <Link href="/dashboard/requests/new" className="inline-flex h-10 items-center rounded-ctl bg-act px-4 text-sm font-semibold text-act-ink hover:bg-act-hover">
              Request a service
            </Link>
          }
        />
      }
    />
  );
}

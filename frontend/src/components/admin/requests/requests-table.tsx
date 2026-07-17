"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Inbox } from "lucide-react";
import { DataTable } from "@/components/admin/ui/data-table";
import { ExportMenu, type ExportColumn } from "@/components/admin/ui/export-menu";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { Badge } from "@/components/admin/ui/badge";
import { requestStatusTone, STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";
import { formatDate } from "@/lib/format-date";
import { formatMoney, num } from "@/lib/invoice/money";
import type { ServiceRequest } from "@/lib/db/schema";

export type RequestListRow = {
  request: ServiceRequest;
  clientName: string | null;
  clientCompany: string | null;
};

const clientLabel = (r: RequestListRow) => r.clientCompany || r.clientName || "—";
const statusLabel = (r: RequestListRow) =>
  STATUS_LABELS[r.request.status as RequestStatus] ?? r.request.status;

/**
 * Requests, searchable by name. The status *views* stay in the URL (the
 * dashboard's pipeline chips deep-link into them); this only adds the
 * free-text search and sorting the plain table never had.
 *
 * Every column that carries a name is a real accessor, not just a `cell` —
 * TanStack's global filter reads accessor values, so a display-only cell is
 * invisible to search.
 */
export function RequestsTable({ rows, emptyTitle }: { rows: RequestListRow[]; emptyTitle: string }) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<RequestListRow, unknown>[]>(
    () => [
      {
        id: "number",
        accessorFn: (r) => r.request.number,
        header: "Request",
        cell: ({ row }) => <span className="font-semibold text-ink">{row.original.request.number}</span>,
      },
      {
        id: "client",
        accessorFn: clientLabel,
        header: "Client",
        cell: ({ row }) => <span className="text-body">{clientLabel(row.original)}</span>,
      },
      {
        id: "service",
        accessorFn: (r) => r.request.serviceName,
        header: "Service",
        cell: ({ row }) => <span className="text-body">{row.original.request.serviceName}</span>,
      },
      {
        id: "amount",
        accessorFn: (r) => (r.request.priceSnapshot ? num(r.request.priceSnapshot) : 0),
        header: "Amount",
        cell: ({ row }) => {
          const r = row.original.request;
          return (
            <span className="tabular-nums text-body">
              {r.priceSnapshot ? formatMoney(num(r.priceSnapshot), r.currency) : "Quote"}
            </span>
          );
        },
      },
      {
        id: "status",
        accessorFn: statusLabel,
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={requestStatusTone(row.original.request.status)}>{statusLabel(row.original)}</Badge>
        ),
      },
      {
        id: "age",
        accessorFn: (r) => r.request.createdAt?.toISOString?.() ?? "",
        header: "Age",
        cell: ({ row }) => <span className="text-xs text-muted">{formatDate(row.original.request.createdAt)}</span>,
      },
    ],
    []
  );

  const exportColumns: ExportColumn<RequestListRow>[] = [
    { header: "Request", accessor: (r) => r.request.number },
    { header: "Client", accessor: (r) => clientLabel(r) },
    { header: "Service", accessor: (r) => r.request.serviceName },
    { header: "Amount", accessor: (r) => (r.request.priceSnapshot ? num(r.request.priceSnapshot) : "") },
    { header: "Currency", accessor: (r) => r.request.currency },
    { header: "Status", accessor: (r) => statusLabel(r) },
    { header: "Submitted", accessor: (r) => formatDate(r.request.createdAt) },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Search by client, request no. or service…"
      onRowClick={(r) => router.push(`/admin/requests/${r.request.id}`)}
      getRowId={(r) => r.request.id}
      toolbar={<ExportMenu rows={rows} columns={exportColumns} filename="requests" title="Service requests" />}
      emptyState={
        <EmptyState
          icon={Inbox}
          title={emptyTitle}
          description="New service requests from the portal land here the moment a client submits."
        />
      }
    />
  );
}

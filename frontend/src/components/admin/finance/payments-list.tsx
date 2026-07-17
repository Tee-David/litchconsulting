"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { HandCoins, BadgeCheck, AlertTriangle, Percent } from "lucide-react";
import { DataTable } from "@/components/admin/ui/data-table";
import { DateRangeFilter, type DateRange } from "@/components/admin/ui/date-range-filter";
import { ExportMenu, type ExportColumn } from "@/components/admin/ui/export-menu";
import { StatCard } from "@/components/admin/ui/stat-card";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { Badge, type BadgeTone } from "@/components/admin/ui/badge";
import { formatMoney, num } from "@/lib/invoice/money";
import { formatDateTime } from "@/lib/format-date";
import type { PaymentRow } from "@/lib/db/queries/payments";

const STATUSES = [
  "all",
  "success",
  "failed",
  "abandoned",
  "flagged_amount_mismatch",
  "duplicate_success",
] as const;

/** Anything that isn't a clean success needs a human to look at it. */
function paymentTone(status: string): BadgeTone {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  if (status.startsWith("flagged") || status === "duplicate_success") return "warning";
  return "neutral";
}

const pretty = (s: string) => s.replace(/_/g, " ");
const dateOf = (r: PaymentRow) => {
  const d = r.payment.paidAt ?? r.payment.createdAt;
  return d ? new Date(d).toISOString().slice(0, 10) : "";
};

export function PaymentsList({ payments }: { payments: PaymentRow[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("all");
  const [range, setRange] = useState<DateRange>({ from: null, to: null });

  const filtered = useMemo(
    () =>
      payments.filter((r) => {
        if (status !== "all" && r.payment.status !== status) return false;
        const d = dateOf(r);
        if (range.from && d < range.from) return false;
        if (range.to && d > range.to) return false;
        return true;
      }),
    [payments, status, range]
  );

  // Settled is what Paystack actually moved; amount is what we asked for. They
  // differ on a mismatch, which is exactly why those rows get flagged.
  const totals = useMemo(() => {
    const ok = filtered.filter((r) => r.payment.status === "success");
    const collected = ok.reduce((s, r) => s + num(r.payment.amountSettled ?? r.payment.amount), 0);
    const attention = filtered.filter(
      (r) => r.payment.status.startsWith("flagged") || r.payment.status === "duplicate_success"
    ).length;
    return {
      collected,
      count: ok.length,
      attention,
      rate: filtered.length ? Math.round((ok.length / filtered.length) * 100) : 0,
    };
  }, [filtered]);

  const clientLabel = (r: PaymentRow) => r.clientCompany || r.clientName || "—";

  const columns = useMemo<ColumnDef<PaymentRow, unknown>[]>(
    () => [
      {
        id: "client",
        accessorFn: clientLabel,
        header: "Client",
        cell: ({ row }) => <span className="font-semibold text-ink">{clientLabel(row.original)}</span>,
      },
      {
        id: "reference",
        accessorFn: (r) => r.payment.reference,
        header: "Reference",
        cell: ({ row }) => <span className="font-mono text-xs text-muted">{row.original.payment.reference}</span>,
      },
      {
        id: "invoice",
        accessorFn: (r) => r.invoiceNumber ?? "",
        header: "Invoice",
        cell: ({ row }) => row.original.invoiceNumber || "—",
      },
      {
        id: "amount",
        accessorFn: (r) => num(r.payment.amountSettled ?? r.payment.amount),
        header: "Amount",
        cell: ({ row }) => {
          const p = row.original.payment;
          return (
            <span className="tabular-nums font-medium text-ink">
              {formatMoney(num(p.amountSettled ?? p.amount), p.currency)}
            </span>
          );
        },
      },
      {
        id: "channel",
        accessorFn: (r) => r.payment.channel ?? "",
        header: "Channel",
        cell: ({ row }) => <span className="capitalize text-body">{pretty(row.original.payment.channel || "—")}</span>,
      },
      {
        id: "status",
        accessorFn: (r) => pretty(r.payment.status),
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={paymentTone(row.original.payment.status)}>{pretty(row.original.payment.status)}</Badge>
        ),
      },
      {
        id: "when",
        accessorFn: dateOf,
        header: "When",
        cell: ({ row }) => {
          const p = row.original.payment;
          return <span className="text-xs text-muted">{formatDateTime(p.paidAt ?? p.createdAt)}</span>;
        },
      },
    ],
    []
  );

  const exportColumns: ExportColumn<PaymentRow>[] = [
    { header: "Date", accessor: (r) => dateOf(r) },
    { header: "Client", accessor: (r) => clientLabel(r) },
    { header: "Reference", accessor: (r) => r.payment.reference },
    { header: "Invoice", accessor: (r) => r.invoiceNumber || "" },
    { header: "Status", accessor: (r) => r.payment.status },
    { header: "Channel", accessor: (r) => r.payment.channel || "" },
    { header: "Amount requested", accessor: (r) => num(r.payment.amount) },
    { header: "Amount settled", accessor: (r) => (r.payment.amountSettled ? num(r.payment.amountSettled) : "") },
    { header: "Currency", accessor: (r) => r.payment.currency },
  ];

  if (payments.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title="No payments yet"
        description="Every Paystack attempt against an invoice lands here — successful, failed or flagged — so you can reconcile by client name or reference."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Collected" value={formatMoney(totals.collected)} icon={HandCoins} hint={`${totals.count} successful`} />
        <StatCard label="Success rate" value={`${totals.rate}%`} icon={Percent} hint={`of ${filtered.length} attempts`} />
        <StatCard label="Needs attention" value={totals.attention} icon={AlertTriangle} hint="flagged / duplicate" />
        <StatCard label="Attempts" value={filtered.length} icon={BadgeCheck} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="Search by client, reference or invoice…"
        onRowClick={(r) => router.push(`/admin/finance/invoices/${r.invoiceId}`)}
        getRowId={(r) => r.payment.id}
        toolbar={
          <>
            <DateRangeFilter onChange={setRange} />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by payment status"
              className="h-9 rounded-lg border border-hairline bg-paper px-3 text-sm capitalize text-ink outline-none focus:border-brand"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s === "all" ? "All statuses" : pretty(s)}
                </option>
              ))}
            </select>
            <ExportMenu rows={filtered} columns={exportColumns} filename="payments" title="Payments" />
          </>
        }
      />
    </div>
  );
}

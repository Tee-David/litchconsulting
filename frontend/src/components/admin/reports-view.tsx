"use client";

import { useMemo, useState } from "react";
import { Wallet, BadgeCheck, Clock, Percent, BarChart3 } from "lucide-react";
import { DateRangeFilter, type DateRange } from "@/components/admin/ui/date-range-filter";
import { StatCard } from "@/components/admin/ui/stat-card";
import { BarChart, DonutChart } from "@/components/admin/ui/charts";
import { ExportMenu } from "@/components/admin/ui/export-menu";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { formatMoney, num } from "@/lib/invoice/money";
import type { InvoiceRow } from "@/lib/db/queries/invoices";

const STATUS_COLORS: Record<string, string> = {
  paid: "#16a34a",
  sent: "#4c6ef5",
  draft: "#f5a524",
  overdue: "#e5484d",
  void: "#8a92a6",
};

function last6Months() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("en", { month: "short" }) };
  });
}

export function ReportsView({ invoices }: { invoices: InvoiceRow[] }) {
  const [range, setRange] = useState<DateRange>({ from: null, to: null });

  const filtered = useMemo(
    () =>
      invoices.filter((i) => {
        const d = i.issueDate || "";
        if (range.from && d < range.from) return false;
        if (range.to && d > range.to) return false;
        return true;
      }),
    [invoices, range],
  );

  const stats = useMemo(() => {
    let invoiced = 0,
      paid = 0,
      outstanding = 0;
    for (const i of filtered) {
      const t = num(i.total);
      invoiced += t;
      if (i.status === "paid") paid += t;
      if (i.status === "sent" || i.status === "overdue") outstanding += t - num(i.amountPaid);
    }
    return { invoiced, paid, outstanding, rate: invoiced ? Math.round((paid / invoiced) * 100) : 0 };
  }, [filtered]);

  const monthly = useMemo(
    () =>
      last6Months().map((m) => ({
        label: m.label,
        value: filtered.filter((i) => (i.issueDate || "").startsWith(m.key)).reduce((s, i) => s + num(i.total), 0),
      })),
    [filtered],
  );

  const byStatus = useMemo(
    () =>
      ["paid", "sent", "draft", "overdue", "void"]
        .map((s) => ({ label: s, value: filtered.filter((i) => i.status === s).length, color: STATUS_COLORS[s] }))
        .filter((s) => s.value > 0),
    [filtered],
  );

  const topClients = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const i of filtered) {
      const k = i.billToCompany || i.billToName || "—";
      const cur = map.get(k) || { total: 0, count: 0 };
      map.set(k, { total: cur.total + num(i.total), count: cur.count + 1 });
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  }, [filtered]);

  const exportColumns = [
    { header: "Invoice", accessor: (r: InvoiceRow) => r.number },
    { header: "Client", accessor: (r: InvoiceRow) => r.billToCompany || r.billToName || "" },
    { header: "Amount", accessor: (r: InvoiceRow) => num(r.total) },
    { header: "Currency", accessor: (r: InvoiceRow) => r.currency },
    { header: "Issued", accessor: (r: InvoiceRow) => r.issueDate },
    { header: "Status", accessor: (r: InvoiceRow) => r.status },
  ];

  const maxClient = Math.max(1, ...topClients.map(([, v]) => v.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateRangeFilter onChange={setRange} />
        <ExportMenu rows={filtered} columns={exportColumns} filename="invoice-report" title="Invoice report" />
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No data to report yet"
          description="Create and send invoices — revenue, collection and client reports build automatically here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Invoiced" value={formatMoney(stats.invoiced)} icon={Wallet} hint={`${filtered.length} invoices`} />
            <StatCard label="Collected" value={formatMoney(stats.paid)} icon={BadgeCheck} />
            <StatCard label="Outstanding" value={formatMoney(stats.outstanding)} icon={Clock} />
            <StatCard label="Collection rate" value={`${stats.rate}%`} icon={Percent} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-card border border-hairline bg-paper p-5 lg:col-span-2">
              <h3 className="mb-4 font-display text-sm font-bold text-ink">Invoiced — last 6 months</h3>
              <BarChart data={monthly} format={(n) => formatMoney(n)} />
            </div>
            <div className="rounded-card border border-hairline bg-paper p-5">
              <h3 className="mb-4 font-display text-sm font-bold text-ink">By status</h3>
              {byStatus.length === 0 ? (
                <p className="py-8 text-center text-sm text-body">No data.</p>
              ) : (
                <>
                  <DonutChart segments={byStatus} centerValue={String(filtered.length)} centerLabel="invoices" />
                  <div className="mt-4 space-y-2">
                    {byStatus.map((s) => (
                      <div key={s.label} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 capitalize text-body">
                          <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                          {s.label}
                        </span>
                        <span className="font-medium tabular-nums text-ink">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rounded-card border border-hairline bg-paper">
            <div className="border-b border-hairline px-5 py-4">
              <h3 className="font-display text-sm font-bold text-ink">Top clients by revenue</h3>
            </div>
            <div className="divide-y divide-hairline">
              {topClients.map(([name, v]) => (
                <div key={name} className="px-5 py-3.5">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-ink">{name}</p>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{formatMoney(v.total)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                      <div className="h-full rounded-full bg-brand dark:bg-highlight" style={{ width: `${(v.total / maxClient) * 100}%` }} />
                    </div>
                    <span className="shrink-0 text-xs text-muted">{v.count} inv</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

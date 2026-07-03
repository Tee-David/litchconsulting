"use client";

import { useMemo, useState } from "react";
import {
  Wallet,
  BadgeCheck,
  Clock,
  Percent,
  BarChart3,
  Receipt,
  TrendingUp,
  Users,
  CalendarRange,
  HandCoins,
  AlertTriangle,
  Timer,
  FileMinus,
} from "lucide-react";
import { DateRangeFilter, type DateRange } from "@/components/admin/ui/date-range-filter";
import { StatCard } from "@/components/admin/ui/stat-card";
import { BarChart, DonutChart } from "@/components/admin/ui/charts";
import { ExportMenu, type ExportColumn } from "@/components/admin/ui/export-menu";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { formatMoney, num, CURRENCIES } from "@/lib/invoice/money";
import { cn } from "@/lib/utils";
import type { InvoiceRow } from "@/lib/db/queries/invoices";

/* ----------------------------------------------------------------------- */
/* Config                                                                    */
/* ----------------------------------------------------------------------- */

const STATUS_COLORS: Record<string, string> = {
  paid: "#16a34a",
  sent: "#4c6ef5",
  draft: "#f5a524",
  overdue: "#e5484d",
  void: "#8a92a6",
};

const STATUSES = ["draft", "sent", "paid", "overdue", "void"] as const;

const REPORTS = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "revenue", label: "Revenue", icon: TrendingUp },
  { key: "collections", label: "Collections", icon: HandCoins },
  { key: "aging", label: "Receivables aging", icon: AlertTriangle },
  { key: "tax", label: "Tax / VAT", icon: Receipt },
  { key: "clients", label: "Clients", icon: Users },
  { key: "monthly", label: "Monthly summary", icon: CalendarRange },
] as const;

type ReportKey = (typeof REPORTS)[number]["key"];

const AGING_BUCKETS = [
  { key: "current", label: "Current", max: 0, color: "#16a34a" },
  { key: "1-30", label: "1–30 days", max: 30, color: "#f5a524" },
  { key: "31-60", label: "31–60 days", max: 60, color: "#f97316" },
  { key: "61-90", label: "61–90 days", max: 90, color: "#e5484d" },
  { key: "90+", label: "90+ days", max: Infinity, color: "#b91c1c" },
] as const;

/* ----------------------------------------------------------------------- */
/* Date helpers                                                              */
/* ----------------------------------------------------------------------- */

const ym = (d?: string | Date | null) => {
  if (!d) return "";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 7);
};

function lastMonths(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - idx), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      short: d.toLocaleString("en", { month: "short" }),
      long: d.toLocaleString("en", { month: "short", year: "numeric" }),
    };
  });
}

function daysBetween(a: string | Date, b: string | Date) {
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  return Math.round((t2 - t1) / 86_400_000);
}

/* ----------------------------------------------------------------------- */
/* Small building blocks                                                     */
/* ----------------------------------------------------------------------- */

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-card border border-hairline bg-paper", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function BreakdownRow({ label, value, tone, strong }: { label: string; value: string; tone?: "muted" | "danger" | "success"; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between px-5 py-3", strong && "bg-surface/50")}>
      <span className={cn("text-sm", strong ? "font-semibold text-ink" : "text-body")}>{label}</span>
      <span
        className={cn(
          "text-sm tabular-nums",
          strong ? "font-bold text-ink" : "font-medium text-ink",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
          tone === "muted" && "text-muted",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Simple sortable-ish read-only data table for report rows. */
function ReportTable<T>({
  columns,
  rows,
  empty = "No data for the selected filters.",
}: {
  columns: { header: string; cell: (r: T) => React.ReactNode; align?: "right" | "left"; className?: string }[];
  rows: T[];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="px-5 py-10 text-center text-sm text-body">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
            {columns.map((c, i) => (
              <th key={i} className={cn("px-5 py-3 font-semibold", c.align === "right" && "text-right")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((r, ri) => (
            <tr key={ri} className="transition-colors hover:bg-surface/50">
              {columns.map((c, ci) => (
                <td key={ci} className={cn("px-5 py-3 text-ink", c.align === "right" && "text-right tabular-nums", c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Main view                                                                 */
/* ----------------------------------------------------------------------- */

export function ReportsView({ invoices }: { invoices: InvoiceRow[] }) {
  const [report, setReport] = useState<ReportKey>("overview");
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [statuses, setStatuses] = useState<Set<string>>(new Set());

  // Currencies present in the data → coherent money math (never mix currencies).
  const currencies = useMemo(() => {
    const set = new Set(invoices.map((i) => i.currency || "NGN"));
    return [...set];
  }, [invoices]);
  const [currency, setCurrency] = useState<string>(currencies[0] || "NGN");
  const cur = currencies.includes(currency) ? currency : currencies[0] || "NGN";
  const fmt = (n: number) => formatMoney(n, cur);

  const filtered = useMemo(
    () =>
      invoices.filter((i) => {
        if ((i.currency || "NGN") !== cur) return false;
        const d = i.issueDate || "";
        if (range.from && d < range.from) return false;
        if (range.to && d > range.to) return false;
        if (statuses.size > 0 && !statuses.has(i.status)) return false;
        return true;
      }),
    [invoices, range, statuses, cur],
  );

  const live = filtered.filter((i) => i.status !== "void");

  /* ---- Aggregate figures ---- */
  const totals = useMemo(() => {
    let gross = 0,
      tax = 0,
      billed = 0,
      collected = 0,
      outstanding = 0,
      voided = 0;
    for (const i of filtered) {
      const t = num(i.total);
      if (i.status === "void") {
        voided += t;
        continue;
      }
      gross += num(i.subtotal);
      tax += num(i.taxTotal);
      billed += t;
      collected += num(i.amountPaid);
      if (i.status === "sent" || i.status === "overdue") outstanding += t - num(i.amountPaid);
    }
    return { gross, tax, billed, collected, outstanding, voided, rate: billed ? Math.round((collected / billed) * 100) : 0 };
  }, [filtered]);

  /* ---- Days-to-pay (collections) ---- */
  const dso = useMemo(() => {
    const paid = filtered.filter((i) => i.status === "paid" && i.paidAt && i.issueDate);
    if (paid.length === 0) return null;
    const sum = paid.reduce((s, i) => s + Math.max(0, daysBetween(i.issueDate!, i.paidAt as unknown as string)), 0);
    return Math.round(sum / paid.length);
  }, [filtered]);

  /* ---- Monthly series (12 months) ---- */
  const months = useMemo(() => lastMonths(12), []);
  const monthly = useMemo(
    () =>
      months.map((m) => {
        const inMonth = live.filter((i) => ym(i.issueDate) === m.key);
        const collectedInMonth = filtered
          .filter((i) => i.paidAt && ym(i.paidAt as unknown as string) === m.key)
          .reduce((s, i) => s + num(i.amountPaid), 0);
        return {
          key: m.key,
          short: m.short,
          long: m.long,
          count: inMonth.length,
          billed: inMonth.reduce((s, i) => s + num(i.total), 0),
          gross: inMonth.reduce((s, i) => s + num(i.subtotal), 0),
          tax: inMonth.reduce((s, i) => s + num(i.taxTotal), 0),
          collected: inMonth.reduce((s, i) => s + num(i.amountPaid), 0),
          collectedByPaidDate: collectedInMonth,
          outstanding: inMonth.reduce((s, i) => s + (i.status === "sent" || i.status === "overdue" ? num(i.total) - num(i.amountPaid) : 0), 0),
        };
      }),
    [months, live, filtered],
  );

  const revenueTrend = useMemo(() => {
    const half = Math.ceil(monthly.length / 2);
    const prev = monthly.slice(0, half).reduce((s, m) => s + m.billed, 0);
    const recent = monthly.slice(half).reduce((s, m) => s + m.billed, 0);
    if (!prev) return null;
    return Math.round(((recent - prev) / prev) * 100);
  }, [monthly]);

  /* ---- By status ---- */
  const byStatus = useMemo(
    () =>
      STATUSES.map((s) => ({ label: s, value: filtered.filter((i) => i.status === s).length, color: STATUS_COLORS[s] })).filter((s) => s.value > 0),
    [filtered],
  );

  /* ---- Aging ---- */
  const aging = useMemo(() => {
    const today = new Date();
    const open = filtered.filter((i) => (i.status === "sent" || i.status === "overdue") && num(i.total) - num(i.amountPaid) > 0);
    const rows = open.map((i) => {
      const due = i.dueDate || i.issueDate;
      const overdue = Math.max(0, daysBetween(due!, today));
      const bucket = AGING_BUCKETS.find((b) => overdue <= b.max) || AGING_BUCKETS[AGING_BUCKETS.length - 1];
      return { invoice: i, overdue, bucket: bucket.key, balance: num(i.total) - num(i.amountPaid) };
    });
    const buckets = AGING_BUCKETS.map((b) => ({
      ...b,
      value: rows.filter((r) => r.bucket === b.key).reduce((s, r) => s + r.balance, 0),
      count: rows.filter((r) => r.bucket === b.key).length,
    }));
    return { rows: rows.sort((a, b) => b.overdue - a.overdue), buckets };
  }, [filtered]);

  /* ---- By client ---- */
  const byClient = useMemo(() => {
    const map = new Map<string, { name: string; billed: number; collected: number; outstanding: number; count: number; last: string }>();
    for (const i of live) {
      const key = i.billToCompany || i.billToName || "—";
      const cur = map.get(key) || { name: key, billed: 0, collected: 0, outstanding: 0, count: 0, last: "" };
      cur.billed += num(i.total);
      cur.collected += num(i.amountPaid);
      if (i.status === "sent" || i.status === "overdue") cur.outstanding += num(i.total) - num(i.amountPaid);
      cur.count += 1;
      if ((i.issueDate || "") > cur.last) cur.last = i.issueDate || "";
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.billed - a.billed);
  }, [live]);

  const maxClient = Math.max(1, ...byClient.map((c) => c.billed));

  /* ---- Empty ---- */
  if (invoices.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={BarChart3}
          title="No data to report yet"
          description="Create and send invoices — revenue, collection, tax and client reports build automatically here."
        />
      </div>
    );
  }

  /* ---- Per-report export config ---- */
  const monthCols: ExportColumn<(typeof monthly)[number]>[] = [
    { header: "Month", accessor: (m) => m.long },
    { header: "Invoices", accessor: (m) => m.count },
    { header: "Gross", accessor: (m) => m.gross },
    { header: "Tax/VAT", accessor: (m) => m.tax },
    { header: "Billed", accessor: (m) => m.billed },
    { header: "Collected", accessor: (m) => m.collected },
    { header: "Outstanding", accessor: (m) => m.outstanding },
  ];

  const activeMeta = REPORTS.find((r) => r.key === report)!;

  return (
    <div className="space-y-6">
      {/* Report type tabs */}
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {REPORTS.map((r) => {
          const active = r.key === report;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setReport(r.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                active ? "border-brand bg-brand text-white dark:border-highlight dark:bg-highlight dark:text-ink" : "border-hairline bg-paper text-body hover:bg-surface hover:text-ink",
              )}
            >
              <r.icon className="size-4" />
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-card border border-hairline bg-paper p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter onChange={setRange} />
          {currencies.length > 1 && (
            <select
              value={cur}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-9 rounded-lg border border-hairline bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-brand"
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {CURRENCIES.find((x) => x.code === c)?.symbol || ""} {c}
                </option>
              ))}
            </select>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {STATUSES.map((s) => {
              const on = statuses.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setStatuses((prev) => {
                      const next = new Set(prev);
                      if (next.has(s)) next.delete(s);
                      else next.add(s);
                      return next;
                    })
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                    on ? "border-transparent text-white" : "border-hairline bg-paper text-body hover:bg-surface",
                  )}
                  style={on ? { background: STATUS_COLORS[s] } : undefined}
                >
                  {s}
                </button>
              );
            })}
            {statuses.size > 0 && (
              <button type="button" onClick={() => setStatuses(new Set())} className="px-1.5 text-xs font-medium text-muted hover:text-ink">
                Clear
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted">
          {filtered.length} of {invoices.length} invoices
        </p>
      </div>

      {/* ===================== OVERVIEW ===================== */}
      {report === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Billed" value={fmt(totals.billed)} icon={Wallet} hint={`${live.length} invoices`} />
            <StatCard label="Collected" value={fmt(totals.collected)} icon={BadgeCheck} hint={`${totals.rate}% rate`} />
            <StatCard label="Outstanding" value={fmt(totals.outstanding)} icon={Clock} />
            <StatCard label="Tax / VAT" value={fmt(totals.tax)} icon={Receipt} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel
              title="Billed — last 12 months"
              className="lg:col-span-2"
              action={<ExportMenu rows={monthly} columns={monthCols} filename="monthly-billed" title={`Billed by month (${cur})`} />}
            >
              <div className="p-5">
                <BarChart data={monthly.map((m) => ({ label: m.short, value: m.billed }))} format={fmt} />
              </div>
            </Panel>

            <Panel title="Finances breakdown">
              <div className="divide-y divide-hairline">
                <BreakdownRow label="Gross (pre-tax)" value={fmt(totals.gross)} />
                <BreakdownRow label="Tax / VAT" value={fmt(totals.tax)} />
                <BreakdownRow label="Total billed" value={fmt(totals.billed)} strong />
                <BreakdownRow label="Collected" value={fmt(totals.collected)} tone="success" />
                <BreakdownRow label="Outstanding" value={fmt(totals.outstanding)} tone="danger" />
                <BreakdownRow label="Voided / written off" value={fmt(totals.voided)} tone="muted" />
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="By status">
              <div className="p-5">
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
            </Panel>

            <Panel title="Top clients by revenue" className="lg:col-span-2">
              <div className="divide-y divide-hairline">
                {byClient.slice(0, 6).map((c) => (
                  <div key={c.name} className="px-5 py-3.5">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{fmt(c.billed)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full bg-brand dark:bg-highlight" style={{ width: `${(c.billed / maxClient) * 100}%` }} />
                      </div>
                      <span className="shrink-0 text-xs text-muted">{c.count} inv</span>
                    </div>
                  </div>
                ))}
                {byClient.length === 0 && <p className="px-5 py-8 text-center text-sm text-body">No data.</p>}
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* ===================== REVENUE ===================== */}
      {report === "revenue" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total billed" value={fmt(totals.billed)} icon={Wallet} hint={`${live.length} invoices`} />
            <StatCard label="Gross (pre-tax)" value={fmt(totals.gross)} icon={TrendingUp} />
            <StatCard label="Avg invoice" value={fmt(live.length ? totals.billed / live.length : 0)} icon={Receipt} />
            <StatCard
              label="6-mo trend"
              value={revenueTrend === null ? "—" : `${revenueTrend > 0 ? "+" : ""}${revenueTrend}%`}
              icon={TrendingUp}
              hint="vs prior 6 mo"
            />
          </div>

          <Panel
            title="Revenue by month"
            action={<ExportMenu rows={monthly} columns={monthCols} filename="revenue-by-month" title={`Revenue by month (${cur})`} />}
          >
            <div className="p-5">
              <BarChart data={monthly.map((m) => ({ label: m.short, value: m.billed }))} format={fmt} height={200} />
            </div>
            <ReportTable
              columns={[
                { header: "Month", cell: (m: (typeof monthly)[number]) => m.long },
                { header: "Invoices", cell: (m) => m.count, align: "right" },
                { header: "Gross", cell: (m) => fmt(m.gross), align: "right" },
                { header: "Tax", cell: (m) => fmt(m.tax), align: "right" },
                { header: "Billed", cell: (m) => <span className="font-semibold">{fmt(m.billed)}</span>, align: "right" },
              ]}
              rows={monthly}
            />
          </Panel>
        </>
      )}

      {/* ===================== COLLECTIONS ===================== */}
      {report === "collections" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Collected" value={fmt(totals.collected)} icon={HandCoins} />
            <StatCard label="Outstanding" value={fmt(totals.outstanding)} icon={Clock} />
            <StatCard label="Collection rate" value={`${totals.rate}%`} icon={Percent} />
            <StatCard label="Avg days to pay" value={dso === null ? "—" : `${dso} days`} icon={Timer} />
          </div>

          <Panel
            title="Payments collected by month"
            action={
              <ExportMenu
                rows={monthly}
                columns={[
                  { header: "Month", accessor: (m) => m.long },
                  { header: "Collected (by paid date)", accessor: (m) => m.collectedByPaidDate },
                ]}
                filename="collections-by-month"
                title={`Collections by month (${cur})`}
              />
            }
          >
            <div className="p-5">
              <BarChart data={monthly.map((m) => ({ label: m.short, value: m.collectedByPaidDate }))} format={fmt} height={200} />
            </div>
          </Panel>

          <Panel title="Paid invoices">
            <ReportTable
              columns={[
                { header: "Invoice", cell: (i: InvoiceRow) => <span className="font-medium">{i.number}</span> },
                { header: "Client", cell: (i) => i.billToCompany || i.billToName || "—" },
                { header: "Issued", cell: (i) => i.issueDate },
                { header: "Paid", cell: (i) => (i.paidAt ? new Date(i.paidAt as unknown as string).toISOString().slice(0, 10) : "—") },
                {
                  header: "Days",
                  cell: (i) => (i.paidAt && i.issueDate ? Math.max(0, daysBetween(i.issueDate, i.paidAt as unknown as string)) : "—"),
                  align: "right",
                },
                { header: "Amount", cell: (i) => <span className="font-semibold">{fmt(num(i.total))}</span>, align: "right" },
              ]}
              rows={filtered.filter((i) => i.status === "paid")}
              empty="No paid invoices in this range."
            />
          </Panel>
        </>
      )}

      {/* ===================== AGING ===================== */}
      {report === "aging" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {aging.buckets.map((b) => (
              <StatCard key={b.key} label={b.label} value={fmt(b.value)} hint={`${b.count} inv`} />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Outstanding by age">
              <div className="p-5">
                {aging.buckets.every((b) => b.value === 0) ? (
                  <p className="py-8 text-center text-sm text-body">Nothing outstanding — you&apos;re all collected.</p>
                ) : (
                  <>
                    <DonutChart
                      segments={aging.buckets.filter((b) => b.value > 0).map((b) => ({ label: b.label, value: b.value, color: b.color }))}
                      centerValue={fmt(totals.outstanding).replace(/\.00$/, "")}
                      centerLabel="outstanding"
                    />
                    <div className="mt-4 space-y-2">
                      {aging.buckets.map((b) => (
                        <div key={b.key} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-body">
                            <span className="size-2.5 rounded-full" style={{ background: b.color }} />
                            {b.label}
                          </span>
                          <span className="font-medium tabular-nums text-ink">{fmt(b.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Panel>

            <Panel
              title="Open invoices — oldest first"
              className="lg:col-span-2"
              action={
                <ExportMenu
                  rows={aging.rows}
                  columns={[
                    { header: "Invoice", accessor: (r) => r.invoice.number },
                    { header: "Client", accessor: (r) => r.invoice.billToCompany || r.invoice.billToName || "" },
                    { header: "Due", accessor: (r) => r.invoice.dueDate || r.invoice.issueDate || "" },
                    { header: "Days overdue", accessor: (r) => r.overdue },
                    { header: "Balance", accessor: (r) => r.balance },
                  ]}
                  filename="receivables-aging"
                  title={`Receivables aging (${cur})`}
                />
              }
            >
              <ReportTable
                columns={[
                  { header: "Invoice", cell: (r: (typeof aging.rows)[number]) => <span className="font-medium">{r.invoice.number}</span> },
                  { header: "Client", cell: (r) => r.invoice.billToCompany || r.invoice.billToName || "—" },
                  { header: "Due", cell: (r) => r.invoice.dueDate || r.invoice.issueDate },
                  {
                    header: "Overdue",
                    cell: (r) => (
                      <span className={cn(r.overdue > 0 ? "font-semibold text-danger" : "text-body")}>{r.overdue > 0 ? `${r.overdue}d` : "Current"}</span>
                    ),
                    align: "right",
                  },
                  { header: "Balance", cell: (r) => <span className="font-semibold">{fmt(r.balance)}</span>, align: "right" },
                ]}
                rows={aging.rows}
                empty="No open invoices — nothing overdue."
              />
            </Panel>
          </div>
        </>
      )}

      {/* ===================== TAX / VAT ===================== */}
      {report === "tax" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Taxable base" value={fmt(totals.gross)} icon={Wallet} />
            <StatCard label="Tax / VAT charged" value={fmt(totals.tax)} icon={Receipt} />
            <StatCard label="Effective rate" value={`${totals.gross ? Math.round((totals.tax / totals.gross) * 100) : 0}%`} icon={Percent} />
          </div>

          <Panel
            title="Tax collected by month"
            action={
              <ExportMenu
                rows={monthly}
                columns={[
                  { header: "Month", accessor: (m) => m.long },
                  { header: "Taxable base", accessor: (m) => m.gross },
                  { header: "Tax/VAT", accessor: (m) => m.tax },
                  { header: "Total billed", accessor: (m) => m.billed },
                ]}
                filename="tax-report"
                title={`Tax / VAT report (${cur})`}
              />
            }
          >
            <div className="p-5">
              <BarChart data={monthly.map((m) => ({ label: m.short, value: m.tax }))} format={fmt} height={200} />
            </div>
            <ReportTable
              columns={[
                { header: "Month", cell: (m: (typeof monthly)[number]) => m.long },
                { header: "Taxable base", cell: (m) => fmt(m.gross), align: "right" },
                { header: "Tax / VAT", cell: (m) => <span className="font-semibold">{fmt(m.tax)}</span>, align: "right" },
                { header: "Total billed", cell: (m) => fmt(m.billed), align: "right" },
              ]}
              rows={monthly}
            />
          </Panel>
        </>
      )}

      {/* ===================== CLIENTS ===================== */}
      {report === "clients" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Clients billed" value={String(byClient.length)} icon={Users} />
            <StatCard label="Total billed" value={fmt(totals.billed)} icon={Wallet} />
            <StatCard label="Avg per client" value={fmt(byClient.length ? totals.billed / byClient.length : 0)} icon={TrendingUp} />
            <StatCard label="Outstanding" value={fmt(totals.outstanding)} icon={Clock} />
          </div>

          <Panel
            title="Revenue by client"
            action={
              <ExportMenu
                rows={byClient}
                columns={[
                  { header: "Client", accessor: (c) => c.name },
                  { header: "Invoices", accessor: (c) => c.count },
                  { header: "Billed", accessor: (c) => c.billed },
                  { header: "Collected", accessor: (c) => c.collected },
                  { header: "Outstanding", accessor: (c) => c.outstanding },
                  { header: "Last invoice", accessor: (c) => c.last },
                ]}
                filename="revenue-by-client"
                title={`Revenue by client (${cur})`}
              />
            }
          >
            <ReportTable
              columns={[
                { header: "Client", cell: (c: (typeof byClient)[number]) => <span className="font-medium">{c.name}</span> },
                { header: "Invoices", cell: (c) => c.count, align: "right" },
                { header: "Billed", cell: (c) => <span className="font-semibold">{fmt(c.billed)}</span>, align: "right" },
                { header: "Collected", cell: (c) => <span className="text-success">{fmt(c.collected)}</span>, align: "right" },
                { header: "Outstanding", cell: (c) => <span className={cn(c.outstanding > 0 && "text-danger")}>{fmt(c.outstanding)}</span>, align: "right" },
                { header: "Last", cell: (c) => c.last || "—" },
              ]}
              rows={byClient}
              empty="No client activity in this range."
            />
          </Panel>
        </>
      )}

      {/* ===================== MONTHLY SUMMARY ===================== */}
      {report === "monthly" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Billed" value={fmt(totals.billed)} icon={Wallet} />
            <StatCard label="Collected" value={fmt(totals.collected)} icon={BadgeCheck} />
            <StatCard label="Tax / VAT" value={fmt(totals.tax)} icon={Receipt} />
            <StatCard label="Voided" value={fmt(totals.voided)} icon={FileMinus} />
          </div>

          <Panel
            title="Monthly summary — last 12 months"
            action={<ExportMenu rows={monthly} columns={monthCols} filename="monthly-summary" title={`Monthly summary (${cur})`} />}
          >
            <ReportTable
              columns={[
                { header: "Month", cell: (m: (typeof monthly)[number]) => <span className="font-medium">{m.long}</span> },
                { header: "Invoices", cell: (m) => m.count, align: "right" },
                { header: "Gross", cell: (m) => fmt(m.gross), align: "right" },
                { header: "Tax", cell: (m) => fmt(m.tax), align: "right" },
                { header: "Billed", cell: (m) => <span className="font-semibold">{fmt(m.billed)}</span>, align: "right" },
                { header: "Collected", cell: (m) => <span className="text-success">{fmt(m.collected)}</span>, align: "right" },
                { header: "Outstanding", cell: (m) => <span className={cn(m.outstanding > 0 && "text-danger")}>{fmt(m.outstanding)}</span>, align: "right" },
              ]}
              rows={monthly}
            />
          </Panel>
        </>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <activeMeta.icon className="size-3.5" />
        {activeMeta.label} · figures shown in {cur}
        {currencies.length > 1 && " · switch currency above to report on other currencies"}
      </p>
    </div>
  );
}

import Link from "next/link";
import { desc } from "drizzle-orm";
import { Plus, Wallet, BadgeCheck, Clock, AlertTriangle, Users, FileText, BarChart3, Receipt } from "lucide-react";
import { db } from "@/lib/db/client";
import { lead } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { invoiceStats, listInvoices } from "@/lib/db/queries/invoices";
import { formatMoney, num } from "@/lib/invoice/money";
import { StatCard } from "@/components/admin/ui/stat-card";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";
import { BarChart, DonutChart } from "@/components/admin/ui/charts";
import { EmptyState } from "@/components/admin/ui/empty-state";

export const dynamic = "force-dynamic";

function last6Months() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("en", { month: "short" }) };
  });
}

const STATUS_COLORS: Record<string, string> = {
  paid: "#16a34a",
  sent: "#4c6ef5",
  draft: "#f5a524",
  overdue: "#e5484d",
  void: "#8a92a6",
};

export default async function AdminDashboard() {
  const [user, stats, invoices, leads] = await Promise.all([
    getSessionUser(),
    invoiceStats(),
    listInvoices(),
    db.select().from(lead).orderBy(desc(lead.createdAt)).limit(50),
  ]);

  const monthly = last6Months().map((m) => ({
    label: m.label,
    value: invoices.filter((i) => (i.issueDate || "").startsWith(m.key)).reduce((s, i) => s + num(i.total), 0),
  }));

  const statusOrder = ["paid", "sent", "draft", "overdue", "void"];
  const byStatus = statusOrder
    .map((s) => ({ label: s, value: invoices.filter((i) => i.status === s).length, color: STATUS_COLORS[s] }))
    .filter((s) => s.value > 0);

  const recent = invoices.slice(0, 5);
  const recentLeads = leads.slice(0, 5);
  const newLeads30 = leads.filter((l) => l.createdAt && new Date(l.createdAt).getTime() > Date.now() - 30 * 864e5).length;
  const collectionRate = stats.invoiced ? Math.round((stats.paid / stats.invoiced) * 100) : 0;
  const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = invoices.filter((i) => (i.issueDate || "").startsWith(monthKey)).reduce((s, i) => s + num(i.total), 0);
  const firstName = (user?.name || "there").split(" ")[0];
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-body">Here&rsquo;s what&rsquo;s happening across your practice.</p>
        </div>
        <Link
          href="/admin/finance/invoices/new"
          className="inline-flex items-center gap-1.5 self-start rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          <Plus className="size-4" /> New invoice
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total invoiced" value={formatMoney(stats.invoiced)} icon={Wallet} hint={`${stats.count} invoices`} />
        <StatCard label="Paid" value={formatMoney(stats.paid)} icon={BadgeCheck} />
        <StatCard label="Outstanding" value={formatMoney(stats.outstanding)} icon={Clock} />
        <StatCard label="Overdue" value={stats.overdueCount} icon={AlertTriangle} hint="invoices" />
      </div>

      {/* Charts + recent */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: bar + recent invoices */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-card border border-hairline bg-paper p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-ink">Invoiced — last 6 months</h3>
            </div>
            <BarChart data={monthly} format={(n) => formatMoney(n)} />
          </div>

          <div className="rounded-card border border-hairline bg-paper">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <h3 className="font-display text-sm font-bold text-ink">Recent invoices</h3>
              <Link href="/admin/finance/invoices" className="text-sm font-medium text-brand hover:underline">
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={FileText} title="No invoices yet" description="Create your first invoice to see it here." />
              </div>
            ) : (
              <div className="divide-y divide-hairline">
                {recent.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/admin/finance/invoices/${inv.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{inv.billToCompany || inv.billToName || "—"}</p>
                      <p className="text-xs text-muted">{inv.number} · {inv.issueDate}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums text-ink">{formatMoney(num(inv.total), inv.currency)}</span>
                      <Badge tone={invoiceStatusTone(inv.status)}>{inv.status}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: quick actions + collection + donut + recent leads */}
        <div className="space-y-6">
          {/* Quick actions */}
          <div className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-3 font-display text-sm font-bold text-ink">Quick actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/admin/finance/invoices/new", icon: Plus, label: "New invoice" },
                { href: "/admin/clients", icon: Users, label: "Clients" },
                { href: "/admin/reports", icon: BarChart3, label: "Reports" },
                { href: "/admin/finance/receipts", icon: Receipt, label: "Receipts" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center gap-2 rounded-xl border border-hairline px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand hover:bg-surface"
                >
                  <a.icon className="size-4 text-brand" />
                  {a.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Collection rate */}
          <div className="rounded-card border border-hairline bg-paper p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-ink">Collection rate</h3>
              <span className="font-display text-lg font-bold text-ink">{collectionRate}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${collectionRate}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">{formatMoney(thisMonth)} invoiced this month</p>
          </div>

          <div className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-4 font-display text-sm font-bold text-ink">Invoices by status</h3>
            {byStatus.length === 0 ? (
              <p className="py-8 text-center text-sm text-body">No data yet.</p>
            ) : (
              <>
                <DonutChart segments={byStatus} centerValue={String(stats.count)} centerLabel="total invoices" />
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

          <div className="rounded-card border border-hairline bg-paper">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <div>
                <h3 className="font-display text-sm font-bold text-ink">Recent leads</h3>
                <p className="text-xs text-muted">{newLeads30} new in 30 days</p>
              </div>
              <Users className="size-4 text-muted" />
            </div>
            {recentLeads.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-body">No leads captured yet.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {recentLeads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{l.name || l.email}</p>
                      <p className="truncate text-xs text-muted">{l.email}</p>
                    </div>
                    <Badge tone="neutral">{l.source}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

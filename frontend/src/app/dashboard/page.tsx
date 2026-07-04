import Link from "next/link";
import { redirect } from "next/navigation";
import { 
  Wallet, 
  Clock, 
  BadgeCheck, 
  LifeBuoy, 
  Settings, 
  FileStack, 
  FileText, 
  ChevronRight, 
  PlusCircle,
  MessageSquare
} from "lucide-react";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { clientInvoiceStats, listClientInvoices } from "@/lib/db/queries/invoices";
import { listClientTickets } from "@/lib/db/queries/tickets";
import { formatMoney } from "@/lib/invoice/money";
import { StatCard } from "@/components/admin/ui/stat-card";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";
import { EmptyState } from "@/components/admin/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function ClientDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard");
  if (user.role === "admin") redirect("/admin");

  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);

  // Fetch client-specific data
  const [stats, invoices, tickets] = await Promise.all([
    clientInvoiceStats(clientRow.id),
    listClientInvoices(clientRow.id),
    listClientTickets(clientRow.id),
  ]);

  const recentInvoices = invoices.slice(0, 5);
  const activeTickets = tickets.filter(t => t.status !== "closed" && t.status !== "resolved");
  const recentTickets = tickets.slice(0, 5);

  const firstName = (user.name || "Client").split(" ")[0];
  const greeting = new Date().getHours() < 12 
    ? "Good morning" 
    : new Date().getHours() < 18 
      ? "Good afternoon" 
      : "Good evening";

  return (
    <div className="space-y-6">
      {/* Header Greeting */}
      <div>
        <h1 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-body">
          Welcome to your secure client portal. Manage billing, documents, and support in one place.
        </p>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard 
          label="Total Invoiced" 
          value={formatMoney(stats.invoiced)} 
          icon={Wallet} 
          hint={`${stats.count} items total`} 
        />
        <StatCard 
          label="Payments Completed" 
          value={formatMoney(stats.paid)} 
          icon={BadgeCheck} 
        />
        <StatCard 
          label="Balance Outstanding" 
          value={formatMoney(stats.outstanding)} 
          icon={Clock} 
        />
        <StatCard 
          label="Active Tickets" 
          value={activeTickets.length} 
          icon={LifeBuoy} 
          hint={`${tickets.length} submitted`}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Columns: Invoices + Tickets */}
        <div className="space-y-6 lg:col-span-2">
          {/* Recent Invoices & Quotes */}
          <div className="rounded-card border border-hairline bg-paper">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <h3 className="font-display text-sm font-bold text-ink">Recent Invoices & Quotes</h3>
              <Link href="/dashboard/invoices" className="text-sm font-medium text-brand hover:underline">
                View all billing
              </Link>
            </div>
            {recentInvoices.length === 0 ? (
              <div className="p-6">
                <EmptyState 
                  icon={FileText} 
                  title="No documents yet" 
                  description="Your invoices and quotes will appear here once issued by the firm." 
                />
              </div>
            ) : (
              <div className="divide-y divide-hairline">
                {recentInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/dashboard/invoices/${inv.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">
                          {inv.projectTitle || "Consulting Services"}
                        </p>
                        <Badge tone={inv.kind === "quote" ? "neutral" : "brand"} className="text-[10px] px-1.5 py-0">
                          {inv.kind}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {inv.number} · Issued {inv.issueDate}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(Number(inv.total), inv.currency)}
                      </span>
                      <Badge tone={invoiceStatusTone(inv.status)}>{inv.status}</Badge>
                      <ChevronRight className="size-4 text-muted shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Support Tickets */}
          <div className="rounded-card border border-hairline bg-paper">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <h3 className="font-display text-sm font-bold text-ink">Support Tickets</h3>
              <Link href="/dashboard/support" className="text-sm font-medium text-brand hover:underline">
                View all support
              </Link>
            </div>
            {recentTickets.length === 0 ? (
              <div className="p-6">
                <EmptyState 
                  icon={MessageSquare} 
                  title="No support tickets" 
                  description="Need help? Open a support ticket to discuss with our consulting team." 
                />
              </div>
            ) : (
              <div className="divide-y divide-hairline">
                {recentTickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/dashboard/support/${t.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{t.subject}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {t.number} · {t.category} · Priority: {t.priority}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge 
                        tone={
                          t.status === "open" 
                            ? "info" 
                            : t.status === "pending" 
                              ? "warning" 
                              : t.status === "resolved" 
                                ? "success" 
                                : "neutral"
                        }
                      >
                        {t.status}
                      </Badge>
                      <ChevronRight className="size-4 text-muted shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Column: Quick Actions + Details */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-3 font-display text-sm font-bold text-ink">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/dashboard/support?new=true", icon: PlusCircle, label: "New ticket" },
                { href: "/dashboard/invoices", icon: Wallet, label: "View invoices" },
                { href: "/dashboard/templates", icon: FileStack, label: "Templates" },
                { href: "/dashboard/settings", icon: Settings, label: "Settings" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex flex-col items-start gap-2 rounded-xl border border-hairline px-3 py-3 text-left transition-colors hover:border-brand hover:bg-surface"
                >
                  <a.icon className="size-5 text-brand" />
                  <span className="text-xs font-semibold text-ink leading-tight">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Billing Info Snapshot */}
          <div className="rounded-card border border-hairline bg-paper p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-sm font-bold text-ink">Client Profile Snapshot</h3>
              <Link href="/dashboard/settings" className="text-xs font-semibold text-brand hover:underline">
                Edit
              </Link>
            </div>
            <div className="space-y-3.5 text-sm">
              <div>
                <p className="text-xs text-muted">Client Name</p>
                <p className="font-medium text-ink mt-0.5">{clientRow.name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Company Name</p>
                <p className="font-medium text-ink mt-0.5">{clientRow.company || "—"}</p>
              </div>
              {clientRow.taxId && (
                <div>
                  <p className="text-xs text-muted">Tax ID / RC Number</p>
                  <p className="font-medium text-ink mt-0.5">{clientRow.taxId}</p>
                </div>
              )}
              {clientRow.phone && (
                <div>
                  <p className="text-xs text-muted">Phone Number</p>
                  <p className="font-medium text-ink mt-0.5">{clientRow.phone}</p>
                </div>
              )}
              {clientRow.address && (
                <div>
                  <p className="text-xs text-muted">Billing Address</p>
                  <p className="font-medium text-ink mt-0.5 leading-relaxed">{clientRow.address}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

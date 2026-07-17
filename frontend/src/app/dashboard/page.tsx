import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Clock,
  BadgeCheck,
  LifeBuoy,
  FileStack,
  FileText,
  ChevronRight,
  PlusCircle,
  ArrowUpRight,
  Briefcase,
  Calculator,
  CalendarClock,
} from "lucide-react";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { clientInvoiceStats, listClientInvoices } from "@/lib/db/queries/invoices";
import { listClientTickets } from "@/lib/db/queries/tickets";
import { listActiveClientRequests } from "@/lib/db/queries/requests";
import { getCatalog } from "@/lib/services/catalog";
import { formatMoney } from "@/lib/invoice/money";
import { StatCard } from "@/components/admin/ui/stat-card";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { ActiveRequestCard } from "@/components/requests/active-request-card";
import { TourWizardButton } from "@/components/tour/tour-wizard-button";

export const dynamic = "force-dynamic";

/**
 * Action-first home (Omni-Agent inspo): "what do you need done" leads, live
 * request progress next, numbers and history below. Empty states guide the
 * first request instead of showing zeroes.
 */
export default async function ClientDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard");
  if (user.role === "admin") redirect("/admin");

  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);

  const [stats, invoices, tickets, activeRequests, catalog] = await Promise.all([
    clientInvoiceStats(clientRow.id),
    listClientInvoices(clientRow.id),
    listClientTickets(clientRow.id),
    listActiveClientRequests(clientRow.id),
    getCatalog().catch(() => []),
  ]);

  const recentInvoices = invoices.slice(0, 4);
  const activeTickets = tickets.filter((t) => t.status !== "closed" && t.status !== "resolved");
  const featuredServices = catalog.slice(0, 3);

  const firstName = (user.name || "Client").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const isNew = activeRequests.length === 0 && invoices.length === 0;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-body">
            {isNew
              ? "Welcome aboard — let's get your first engagement moving."
              : "Here's where everything stands today."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start">
          <TourWizardButton />
          <Link
            href="/dashboard/requests/new"
            data-tour="request-service"
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover keep-brand"
          >
            <PlusCircle className="size-4" /> Request a service
          </Link>
        </div>
      </div>

      {/* What do you need done? */}
      <div data-tour="services" className="rounded-card border border-hairline bg-paper p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-sm font-bold text-ink">What do you need done?</h3>
          <Link
            href="/dashboard/requests/new"
            className="text-sm font-medium text-brand hover:underline"
          >
            All services
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {featuredServices.map((s) => (
            <Link
              key={s.slug}
              href={`/dashboard/requests/new?service=${s.slug}`}
              className="group flex flex-col rounded-xl border border-hairline p-4 transition-colors hover:border-brand/40 hover:bg-surface"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-ink">{s.name}</p>
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  <ArrowUpRight className="size-3.5" />
                </span>
              </div>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-body">{s.tagline}</p>
              <p className="mt-3 text-xs font-bold text-brand">
                {s.pricingMode === "fixed" && s.priceNgn
                  ? `From ${formatMoney(Number(s.priceNgn))}`
                  : "Get A Quote"}
              </p>
            </Link>
          ))}
        </div>
      </div>

      {/* Active engagements */}
      {activeRequests.length > 0 && (
        <div data-tour="active-requests">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-display text-sm font-bold text-ink">Your active services</h3>
            <Link href="/dashboard/requests" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {activeRequests.slice(0, 4).map((req) => (
              <ActiveRequestCard key={req.id} req={req} />
            ))}
          </div>
        </div>
      )}

      {/* KPI Stats */}
      <div data-tour="client-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active Services"
          value={activeRequests.length}
          icon={Briefcase}
          hint={activeRequests.length ? "In progress now" : "None yet"}
        />
        <StatCard label="Payments Completed" value={formatMoney(stats.paid)} icon={BadgeCheck} />
        <StatCard label="Balance Outstanding" value={formatMoney(stats.outstanding)} icon={Clock} />
        <StatCard
          label="Active Tickets"
          value={activeTickets.length}
          icon={LifeBuoy}
          hint={`${tickets.length} submitted`}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Recent billing */}
          <div data-tour="billing" className="rounded-card border border-hairline bg-paper">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <h3 className="font-display text-sm font-bold text-ink">Recent Billing</h3>
              <Link href="/dashboard/invoices" className="text-sm font-medium text-brand hover:underline">
                View all billing
              </Link>
            </div>
            {recentInvoices.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={FileText}
                  title="No documents yet"
                  description="Invoices and receipts appear here the moment a request is priced or paid."
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
                        <Badge tone={inv.kind === "quote" ? "neutral" : "brand"} className="px-1.5 py-0 text-[10px]">
                          {inv.kind}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {inv.number} · Issued {inv.issueDate}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(Number(inv.total), inv.currency)}
                      </span>
                      <Badge tone={invoiceStatusTone(inv.status)}>{inv.status}</Badge>
                      <ChevronRight className="size-4 shrink-0 text-muted" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: tools + quick actions */}
        <div className="space-y-6">
          <div data-tour="quick-actions" className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-3 font-display text-sm font-bold text-ink">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/dashboard/requests/new", icon: PlusCircle, label: "Request a service" },
                { href: "/book", icon: CalendarClock, label: "Book consultation" },
                { href: "/dashboard/support?new=true", icon: LifeBuoy, label: "Get support" },
                { href: "/dashboard/templates", icon: FileStack, label: "Templates" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex flex-col items-start gap-2 rounded-xl border border-hairline px-3 py-3 text-left transition-colors hover:border-brand hover:bg-surface"
                >
                  <a.icon className="size-5 text-brand" />
                  <span className="text-xs font-semibold leading-tight text-ink">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div data-tour="tools" className="rounded-card border border-hairline bg-paper p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-full bg-brand-tint text-brand">
                <Calculator className="size-4.5" />
              </span>
              <div>
                <h3 className="font-display text-sm font-bold text-ink">Free tools</h3>
                <p className="text-xs text-muted">PAYE, VAT, CIT & more</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-body">
              Run quick Nigerian tax and loan calculations — the same NTA-2025 rates we use in your
              engagements. Find them in the calculator icon on the top bar.
            </p>
          </div>

          <div className="rounded-card border border-hairline bg-paper p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-ink">Profile Snapshot</h3>
              <Link href="/dashboard/settings" className="text-xs font-semibold text-brand hover:underline">
                Edit
              </Link>
            </div>
            <div className="space-y-3.5 text-sm">
              <div>
                <p className="text-xs text-muted">Client Name</p>
                <p className="mt-0.5 font-medium text-ink">{clientRow.name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Company</p>
                <p className="mt-0.5 font-medium text-ink">{clientRow.company || "—"}</p>
              </div>
              {clientRow.taxId && (
                <div>
                  <p className="text-xs text-muted">Tax ID / RC Number</p>
                  <p className="mt-0.5 font-medium text-ink">{clientRow.taxId}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

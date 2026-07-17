import Link from "next/link";
import { Inbox, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { PushToggle } from "@/components/admin/push-toggle";
import { StatCard } from "@/components/admin/ui/stat-card";
import { RequestsTable } from "@/components/admin/requests/requests-table";
import { ConsultationsList } from "@/components/admin/requests/consultations-list";
import {
  listRequestsWithClients,
  listConsultations,
  requestStats,
} from "@/lib/db/queries/requests";
import { ACTIVE_STATUSES, REQUEST_STATUSES, type RequestStatus } from "@/lib/requests/status";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "action", label: "Needs action" },
  { key: "all", label: "All" },
] as const;

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "consultations" ? "consultations" : "requests";
  // Named views (open/action/all) or any single status (dashboard pipeline chips).
  const isStatusFilter = REQUEST_STATUSES.includes(params.filter as RequestStatus);
  const filter = isStatusFilter
    ? params.filter!
    : FILTERS.some((f) => f.key === params.filter)
      ? params.filter!
      : "open";

  const [rows, consultations, stats] = await Promise.all([
    listRequestsWithClients(),
    tab === "consultations" ? listConsultations() : Promise.resolve([]),
    requestStats(),
  ]);

  const filtered = rows.filter(({ request: r }) => {
    if (isStatusFilter) return r.status === filter;
    if (filter === "all") return true;
    if (filter === "action")
      return ["quote_requested", "in_review", "delivered"].includes(r.status);
    return ACTIVE_STATUSES.includes(r.status as RequestStatus);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        description="Service requests from the portal — quotes to send, work to deliver, payments to watch."
      >
        <PushToggle />
        <Link
          href="/admin/services"
          data-tour="service-catalog"
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-2 text-xs font-semibold text-body transition-colors hover:bg-surface"
        >
          <SlidersHorizontal className="size-4" /> Service catalog
        </Link>
      </PageHeader>

      <div data-tour="requests-stats" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open requests" value={stats.open} icon={Inbox} />
        <StatCard label="Awaiting quote/payment" value={stats.pendingPayment} icon={Inbox} />
        <StatCard label="Awaiting documents" value={stats.awaitingDocs} icon={Inbox} />
        <StatCard label="Delivered, unclosed" value={stats.delivered} icon={Inbox} />
      </div>

      {/* Tabs */}
      <div data-tour="requests-status-tabs" className="flex items-center justify-between gap-3 border-b border-hairline">
        <div className="flex gap-1">
          {[
            { key: "requests", label: "Service requests", href: "/admin/requests" },
            {
              key: "consultations",
              label: "Consultations",
              href: "/admin/requests?tab=consultations",
            },
          ].map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={cn(
                "border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                tab === t.key
                  ? "border-brand text-ink"
                  : "border-transparent text-muted hover:text-ink"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {tab === "requests" && (
          <div className="flex gap-1 pb-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={`/admin/requests?filter=${f.key}`}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  filter === f.key
                    ? "bg-brand text-white keep-brand"
                    : "text-muted hover:bg-surface hover:text-ink"
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {tab === "consultations" ? (
        <ConsultationsList rows={consultations} />
      ) : (
        <div data-tour="requests-table">
          <RequestsTable rows={filtered} emptyTitle={filter === "open" ? "No open requests" : "Nothing here"} />
        </div>
      )}
    </div>
  );
}

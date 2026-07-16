import Link from "next/link";
import { Inbox, CalendarClock, ChevronRight, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { PushToggle } from "@/components/admin/push-toggle";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { Badge } from "@/components/admin/ui/badge";
import { StatCard } from "@/components/admin/ui/stat-card";
import {
  listRequestsWithClients,
  listConsultations,
  requestStats,
} from "@/lib/db/queries/requests";
import {
  requestStatusTone,
  STATUS_LABELS,
  ACTIVE_STATUSES,
  REQUEST_STATUSES,
  type RequestStatus,
} from "@/lib/requests/status";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { formatMoney, num } from "@/lib/invoice/money";
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
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-2 text-xs font-semibold text-body transition-colors hover:bg-surface"
        >
          <SlidersHorizontal className="size-4" /> Service catalog
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open requests" value={stats.open} icon={Inbox} />
        <StatCard label="Awaiting quote/payment" value={stats.pendingPayment} icon={Inbox} />
        <StatCard label="Awaiting documents" value={stats.awaitingDocs} icon={Inbox} />
        <StatCard label="Delivered, unclosed" value={stats.delivered} icon={Inbox} />
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline">
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
        <div className="rounded-card border border-hairline bg-paper">
          {consultations.length === 0 ? (
            <div className="p-10">
              <EmptyState
                icon={CalendarClock}
                title="No consultations yet"
                description="Bookings made through the Cal.com scheduler on /book appear here automatically."
              />
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {consultations.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {c.name || c.email}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {c.email}
                      {c.startsAt ? ` · ${formatDateTime(c.startsAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.meetingUrl && c.status !== "cancelled" && (
                      <a
                        href={c.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-brand hover:underline"
                      >
                        Join call
                      </a>
                    )}
                    <Badge
                      tone={
                        c.status === "cancelled"
                          ? "danger"
                          : c.status === "rescheduled"
                            ? "warning"
                            : "success"
                      }
                    >
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-card border border-hairline bg-paper">
          {filtered.length === 0 ? (
            <div className="p-10">
              <EmptyState
                icon={Inbox}
                title={filter === "open" ? "No open requests" : "Nothing here"}
                description="New service requests from the portal land here the moment a client submits."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs uppercase tracking-wider text-muted">
                    <th className="px-5 py-3 font-semibold">Request</th>
                    <th className="px-5 py-3 font-semibold">Client</th>
                    <th className="px-5 py-3 font-semibold">Service</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Age</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filtered.map(({ request: r, clientName, clientCompany }) => (
                    <tr key={r.id} className="group transition-colors hover:bg-surface">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/requests/${r.id}`}
                          className="font-semibold text-ink hover:text-brand"
                        >
                          {r.number}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-body">
                        {clientCompany || clientName || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-body">{r.serviceName}</td>
                      <td className="px-5 py-3.5 tabular-nums text-body">
                        {r.priceSnapshot
                          ? formatMoney(num(r.priceSnapshot), r.currency)
                          : "Quote"}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={requestStatusTone(r.status)}>
                          {STATUS_LABELS[r.status as RequestStatus] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted">{formatDate(r.createdAt)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/admin/requests/${r.id}`}
                          className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          Open <ChevronRight className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

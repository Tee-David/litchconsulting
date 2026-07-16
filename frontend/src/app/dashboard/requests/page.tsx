import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, PackageSearch, PlusCircle } from "lucide-react";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { listClientRequests } from "@/lib/db/queries/requests";
import { Badge } from "@/components/admin/ui/badge";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { ActiveRequestCard } from "@/components/requests/active-request-card";
import {
  requestStatusTone,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  type RequestStatus,
} from "@/lib/requests/status";
import { formatDate } from "@/lib/format-date";

export const dynamic = "force-dynamic";

export default async function ClientRequestsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard/requests");
  if (user.role === "admin") redirect("/admin/requests");

  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);
  const requests = await listClientRequests(clientRow.id);
  const active = requests.filter(
    (r) => !TERMINAL_STATUSES.includes(r.status as (typeof TERMINAL_STATUSES)[number])
  );
  const past = requests.filter((r) =>
    TERMINAL_STATUSES.includes(r.status as (typeof TERMINAL_STATUSES)[number])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-hairline pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
            My Services
          </h1>
          <p className="mt-1 text-sm text-body">
            Everything you&apos;ve requested — live progress, documents, and deliverables.
          </p>
        </div>
        <Link
          href="/dashboard/requests/new"
          data-tour="request-service"
          className="inline-flex items-center gap-2 self-start rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover keep-brand"
        >
          <PlusCircle className="size-4" /> Request a service
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-card border border-hairline bg-paper p-10">
          <EmptyState
            icon={PackageSearch}
            title="No services yet"
            description="Pick a service and we'll guide you through it — most requests take under two minutes to submit."
            action={
              <Link
                href="/dashboard/requests/new"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover keep-brand"
              >
                <PlusCircle className="size-4" /> Browse services
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {active.map((req) => (
                <ActiveRequestCard key={req.id} req={req} />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="rounded-card border border-hairline bg-paper">
              <div className="border-b border-hairline px-5 py-4">
                <h3 className="font-display text-sm font-bold text-ink">Past requests</h3>
              </div>
              <div className="divide-y divide-hairline">
                {past.map((req) => (
                  <Link
                    key={req.id}
                    href={`/dashboard/requests/${req.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{req.serviceName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {req.number} · {formatDate(req.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={requestStatusTone(req.status)}>
                        {STATUS_LABELS[req.status as RequestStatus] ?? req.status}
                      </Badge>
                      <ChevronRight className="size-4 shrink-0 text-muted" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

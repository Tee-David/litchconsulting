import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  CalendarClock,
  ChevronRight,
  Clock,
  FileText,
  Hash,
  LifeBuoy,
  Mail,
  MapPin,
  Phone,
  Plus,
  Table2,
  Wallet,
} from "lucide-react";
import { getClient, findDuplicateClients } from "@/lib/db/queries/clients";
import { getUserByIdOrEmail, portalStatusOf, type PortalStatus } from "@/lib/db/queries/users";
import { listClientInvoices } from "@/lib/db/queries/invoices";
import {
  listClientRequests,
  listClientConsultations,
  listClientDocuments,
  listClientPayments,
} from "@/lib/db/queries/requests";
import { listClientTickets } from "@/lib/db/queries/tickets";
import { listClientNotes } from "@/lib/db/queries/notes";
import { clientActivity } from "@/lib/db/queries/notifications";
import { EditClientButton } from "@/components/admin/client/edit-client-button";
import { Badge, invoiceStatusTone, type BadgeTone } from "@/components/admin/ui/badge";
import { StatCard } from "@/components/admin/ui/stat-card";
import { QueryTabs } from "@/components/admin/ui/tabs";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { GroupedBars } from "@/components/charts";
import { Avatar } from "@/components/ui/avatar";
import { ActiveRequestCard } from "@/components/requests/active-request-card";
import {
  requestStatusTone,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  type RequestStatus,
} from "@/lib/requests/status";
import { formatMoney, num, round2 } from "@/lib/invoice/money";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { NotesRail } from "./notes-rail";
import { ClientQuickActions } from "./client-quick-actions";
import { DocDownloadButton } from "./doc-download-button";
import { ActivityList } from "./activity-list";
import { BillingExport } from "./billing-export";

export const dynamic = "force-dynamic";

const TABS = ["overview", "services", "billing", "documents", "support", "activity"] as const;
type Tab = (typeof TABS)[number];

const PORTAL_BADGE: Record<PortalStatus, { label: string; tone: BadgeTone }> = {
  "no-account": { label: "No portal account", tone: "neutral" },
  unverified: { label: "Portal unverified", tone: "warning" },
  active: { label: "Portal active", tone: "success" },
  banned: { label: "Banned", tone: "danger" },
};

function last6Months() {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({
      key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`,
      label: m.toLocaleString("en-NG", { month: "short" }),
    });
  }
  return out;
}

/**
 * Client profile hub — everything about one client in six query-param tabs.
 * Only the active tab's extra data is fetched; the header/KPI batch is shared.
 */
export default async function ClientHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const tabParam = (await searchParams).tab;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview";

  const clientRow = await getClient(id);
  if (!clientRow) notFound();

  const [portalUser, invoices, requests, tickets, duplicates] = await Promise.all([
    getUserByIdOrEmail(clientRow.userId, clientRow.email),
    listClientInvoices(id),
    listClientRequests(id),
    listClientTickets(id),
    findDuplicateClients(clientRow.email, id),
  ]);

  const portal = PORTAL_BADGE[portalStatusOf(portalUser)];
  const billed = invoices.filter((i) => i.kind === "invoice").reduce((s, i) => s + num(i.total), 0);
  const paid = invoices
    .filter((i) => i.kind === "invoice")
    .reduce((s, i) => s + num(i.amountPaid), 0);
  const outstanding = round2(billed - paid);
  const overdueAmount = round2(
    invoices
      .filter((i) => i.kind === "invoice" && i.status === "overdue")
      .reduce((s, i) => s + num(i.total) - num(i.amountPaid), 0)
  );
  const activeRequests = requests.filter(
    (r) => !TERMINAL_STATUSES.includes(r.status as (typeof TERMINAL_STATUSES)[number])
  );
  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "pending");
  const displayName = clientRow.company || clientRow.name;

  const detail = [
    clientRow.email && { icon: Mail, value: clientRow.email, href: `mailto:${clientRow.email}` },
    clientRow.phone && { icon: Phone, value: clientRow.phone, href: `tel:${clientRow.phone}` },
    clientRow.address && { icon: MapPin, value: clientRow.address },
    clientRow.taxId && { icon: Hash, value: `Tax ID: ${clientRow.taxId}` },
  ].filter(Boolean) as { icon: typeof Mail; value: string; href?: string }[];

  return (
    <div className="space-y-6">
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Clients
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={displayName} email={clientRow.email} size={14} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {displayName}
              </h2>
              <Badge tone={portal.tone}>{portal.label}</Badge>
              {overdueAmount > 0 && (
                <Badge tone="danger">{formatMoney(overdueAmount)} overdue</Badge>
              )}
              {duplicates.length > 0 && <Badge tone="warning">possible duplicate</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-body">
              {clientRow.company && clientRow.name !== clientRow.company ? `${clientRow.name} · ` : ""}
              Client since {formatDate(clientRow.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/finance/invoices/new?clientId=${id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover keep-brand"
          >
            <Plus className="size-4" /> New invoice
          </Link>
          {clientRow.email && (
            <a
              href={`mailto:${clientRow.email}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-body transition-colors hover:bg-surface"
            >
              <Mail className="size-4" /> Email
            </a>
          )}
          <EditClientButton client={clientRow} />
          <ClientQuickActions
            clientId={id}
            clientName={displayName}
            canInvite={portalStatusOf(portalUser) === "no-account" && Boolean(clientRow.email)}
            duplicates={duplicates.map((d) => ({
              id: d.id,
              name: d.name,
              company: d.company,
              hasAccount: Boolean(d.userId),
              createdAt: (d.createdAt as Date).toISOString(),
            }))}
            aiConfigured={Boolean(process.env.LITCHAI_API_URL)}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total billed" value={formatMoney(billed)} icon={Wallet} />
        <StatCard label="Paid" value={formatMoney(paid)} icon={BadgeCheck} />
        <StatCard label="Outstanding" value={formatMoney(outstanding)} icon={Clock} />
        <StatCard label="Active services" value={activeRequests.length} icon={Briefcase} />
        <StatCard
          label="Open tickets"
          value={openTickets.length}
          icon={LifeBuoy}
          hint={`${tickets.length} all time`}
        />
      </div>

      <QueryTabs
        defaultValue="overview"
        tabs={[
          { label: "Overview", value: "overview" },
          { label: "Services", value: "services", count: requests.length },
          { label: "Billing", value: "billing", count: invoices.length },
          { label: "Documents", value: "documents" },
          { label: "Support", value: "support", count: openTickets.length },
          { label: "Activity", value: "activity" },
        ]}
      />

      {tab === "overview" && (
        <OverviewTab
          clientId={id}
          email={clientRow.email}
          detail={detail}
          notesText={clientRow.notes}
          activeRequests={activeRequests}
        />
      )}
      {tab === "services" && (
        <ServicesTab clientId={id} email={clientRow.email} requests={requests} />
      )}
      {tab === "billing" && <BillingTab clientId={id} invoices={invoices} />}
      {tab === "documents" && <DocumentsTab clientId={id} />}
      {tab === "support" && <SupportTab tickets={tickets} />}
      {tab === "activity" && <ActivityTab clientId={id} />}
    </div>
  );
}

/* --------------------------------- Overview -------------------------------- */

async function OverviewTab({
  clientId,
  email,
  detail,
  notesText,
  activeRequests,
}: {
  clientId: string;
  email: string | null;
  detail: { icon: typeof Mail; value: string; href?: string }[];
  notesText: string | null;
  activeRequests: Awaited<ReturnType<typeof listClientRequests>>;
}) {
  const [consultations, notes, activity] = await Promise.all([
    listClientConsultations(clientId, email),
    listClientNotes(clientId),
    clientActivity(clientId, 8),
  ]);
  const upcoming = consultations.filter(
    (c) => c.status !== "cancelled" && c.startsAt && (c.startsAt as Date) > new Date()
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {activeRequests.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {activeRequests.slice(0, 4).map((req) => (
              <ActiveRequestCard key={req.id} req={req} hrefBase="/admin/requests" />
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-hairline bg-paper p-8">
            <EmptyState
              icon={Briefcase}
              title="No active services"
              description="When this client requests a service (or you invoice them), progress shows up here."
            />
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="rounded-card border border-hairline bg-paper">
            <div className="border-b border-hairline px-5 py-4">
              <h3 className="font-display text-sm font-bold text-ink">Upcoming consultations</h3>
            </div>
            <div className="divide-y divide-hairline">
              {upcoming.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-full bg-brand-tint text-brand">
                      <CalendarClock className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {c.startsAt ? formatDateTime(c.startsAt) : "Unscheduled"}
                      </p>
                      <p className="text-xs text-muted">{c.name || c.email}</p>
                    </div>
                  </div>
                  {c.meetingUrl && (
                    <a
                      href={c.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      Join call
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity preview */}
        <div className="rounded-card border border-hairline bg-paper">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h3 className="font-display text-sm font-bold text-ink">Recent activity</h3>
            <Link href="?tab=activity" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Nothing yet.</p>
          ) : (
            <div className="divide-y divide-hairline">
              {activity.map((a) => (
                <Link
                  key={a.id}
                  href={a.href}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{a.title}</p>
                    <p className="truncate text-xs text-muted">{a.description}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                    {formatDateTime(a.at)} <ChevronRight className="size-4" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rail */}
      <div className="space-y-6">
        <NotesRail clientId={clientId} notes={notes} />
        <div className="rounded-card border border-hairline bg-paper p-5">
          <h3 className="mb-3 font-display text-sm font-bold text-ink">Contact</h3>
          {detail.length === 0 ? (
            <p className="text-sm text-body">No contact details yet — use Edit to add them.</p>
          ) : (
            <ul className="space-y-3">
              {detail.map((d, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <d.icon className="mt-0.5 size-4 shrink-0 text-muted" />
                  {d.href ? (
                    <a href={d.href} className="break-all text-ink hover:text-brand">
                      {d.value}
                    </a>
                  ) : (
                    <span className="text-ink">{d.value}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {notesText && (
            <div className="mt-4 border-t border-hairline pt-3">
              <p className="text-xs font-medium text-body">Profile notes</p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink">{notesText}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Services -------------------------------- */

async function ServicesTab({
  clientId,
  email,
  requests,
}: {
  clientId: string;
  email: string | null;
  requests: Awaited<ReturnType<typeof listClientRequests>>;
}) {
  const consultations = await listClientConsultations(clientId, email);
  return (
    <div className="space-y-6">
      <div className="rounded-card border border-hairline bg-paper">
        <div className="border-b border-hairline px-5 py-4">
          <h3 className="font-display text-sm font-bold text-ink">Service requests</h3>
        </div>
        {requests.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Briefcase}
              title="No requests yet"
              description="Requests this client submits from the portal land here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-5 py-3 font-semibold">Request</th>
                  <th className="px-5 py-3 font-semibold">Service</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {requests.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/requests/${r.id}`}
                        className="font-semibold text-ink hover:text-brand"
                      >
                        {r.number}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-body">{r.serviceName}</td>
                    <td className="px-5 py-3.5 tabular-nums text-body">
                      {r.priceSnapshot ? formatMoney(num(r.priceSnapshot), r.currency) : "Quote"}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={requestStatusTone(r.status)}>
                        {STATUS_LABELS[r.status as RequestStatus] ?? r.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {consultations.length > 0 && (
        <div className="rounded-card border border-hairline bg-paper">
          <div className="border-b border-hairline px-5 py-4">
            <h3 className="font-display text-sm font-bold text-ink">Consultations</h3>
          </div>
          <div className="divide-y divide-hairline">
            {consultations.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {c.startsAt ? formatDateTime(c.startsAt) : "Unscheduled"}
                  </p>
                  <p className="text-xs text-muted">{c.email}</p>
                </div>
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Billing --------------------------------- */

async function BillingTab({
  clientId,
  invoices,
}: {
  clientId: string;
  invoices: Awaited<ReturnType<typeof listClientInvoices>>;
}) {
  const payments = await listClientPayments(clientId);
  const shownPayments = payments.filter((p) => p.status !== "initialized").slice(0, 10);

  const months = last6Months();
  const chart = months.map((m) => ({
    label: m.label,
    value: invoices
      .filter((i) => i.kind === "invoice" && (i.issueDate || "").startsWith(m.key))
      .reduce((s, i) => s + num(i.total), 0),
    value2: invoices
      .filter(
        (i) =>
          i.kind === "invoice" && i.paidAt && (i.paidAt as Date).toISOString().startsWith(m.key)
      )
      .reduce((s, i) => s + num(i.amountPaid), 0),
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-hairline bg-paper p-5">
        <h3 className="mb-4 font-display text-sm font-bold text-ink">
          Billed vs collected — last 6 months
        </h3>
        <GroupedBars
          data={chart}
          series={[
            { key: "value", label: "Billed" },
            { key: "value2", label: "Collected" },
          ]}
          format="money"
          height={160}
        />
      </div>

      <div className="rounded-card border border-hairline bg-paper">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h3 className="font-display text-sm font-bold text-ink">Invoices & quotes</h3>
          <BillingExport
            filename={`client-billing-${clientId.slice(0, 8)}`}
            rows={invoices.map((i) => ({
              number: i.number,
              kind: i.kind,
              status: i.status,
              issueDate: i.issueDate || "",
              dueDate: i.dueDate || "",
              total: i.total,
              amountPaid: i.amountPaid,
              currency: i.currency,
              projectTitle: i.projectTitle || "",
            }))}
          />
        </div>
        {invoices.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={FileText}
              title="No billing yet"
              description="Invoices and quotes for this client appear here."
            />
          </div>
        ) : (
          <div className="divide-y divide-hairline">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/admin/finance/${inv.kind === "quote" ? "quotes" : "invoices"}/${inv.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {inv.number}
                    <span className="ml-2 text-xs font-medium uppercase text-muted">{inv.kind}</span>
                  </p>
                  <p className="text-xs text-muted">
                    Issued {inv.issueDate}
                    {inv.dueDate ? ` · due ${inv.dueDate}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(num(inv.total), inv.currency)}
                  </span>
                  <Badge tone={invoiceStatusTone(inv.status)}>{inv.status}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {shownPayments.length > 0 && (
        <div className="rounded-card border border-hairline bg-paper">
          <div className="border-b border-hairline px-5 py-4">
            <h3 className="font-display text-sm font-bold text-ink">Payment history</h3>
          </div>
          <div className="divide-y divide-hairline">
            {shownPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-semibold text-ink">{p.reference}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(p.createdAt)}
                    {p.channel ? ` · ${p.channel.replace(/_/g, " ")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(num(p.amount), p.currency)}
                  </span>
                  <Badge
                    tone={
                      p.status === "success"
                        ? "success"
                        : p.status === "failed" || p.status === "abandoned"
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {p.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Documents -------------------------------- */

async function DocumentsTab({ clientId }: { clientId: string }) {
  const docs = await listClientDocuments(clientId);
  if (docs.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-paper p-8">
        <EmptyState
          icon={FileText}
          title="No documents"
          description="Client uploads and deliverables across all their requests show up here."
        />
      </div>
    );
  }

  // Group by request, newest request first.
  const groups = new Map<string, typeof docs>();
  for (const d of docs) {
    const list = groups.get(d.requestId) ?? [];
    list.push(d);
    groups.set(d.requestId, list);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([requestId, rows]) => (
        <div key={requestId} className="rounded-card border border-hairline bg-paper">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
            <Link
              href={`/admin/requests/${requestId}`}
              className="font-display text-sm font-bold text-ink hover:text-brand"
            >
              {rows[0].requestNumber} — {rows[0].serviceName}
            </Link>
          </div>
          <ul className="divide-y divide-hairline">
            {rows.map(({ document: d }) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="size-4.5 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{d.fileName}</p>
                    <p className="text-xs text-muted">
                      {formatDateTime(d.createdAt)}
                      {d.litchaiStatus ? ` · AI: ${d.litchaiStatus}` : ""}
                    </p>
                  </div>
                  <Badge tone={d.kind === "deliverable" ? "success" : "neutral"}>
                    {d.kind === "deliverable" ? "deliverable" : "upload"}
                  </Badge>
                  {d.publishVariant === "manual_override" && <Badge tone="warning">unverified</Badge>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {/\.(xlsx|xls|csv)$/i.test(d.fileName) && (
                    <Link
                      href={`/admin/analyses/editor?requestId=${requestId}&documentId=${d.id}`}
                      className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
                      title="Open in spreadsheet editor"
                    >
                      <Table2 className="size-4" />
                    </Link>
                  )}
                  <DocDownloadButton requestId={requestId} documentId={d.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- Support --------------------------------- */

function SupportTab({ tickets }: { tickets: Awaited<ReturnType<typeof listClientTickets>> }) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-paper p-8">
        <EmptyState
          icon={LifeBuoy}
          title="No tickets"
          description="Support conversations with this client appear here."
        />
      </div>
    );
  }
  return (
    <div className="rounded-card border border-hairline bg-paper">
      <div className="divide-y divide-hairline">
        {tickets.map((t) => (
          <Link
            key={t.id}
            href="/admin/help-desk"
            className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{t.subject}</p>
              <p className="text-xs text-muted">
                {t.number} · {t.category} · last reply{" "}
                {t.lastReplyAt ? formatDateTime(t.lastReplyAt) : "—"}
              </p>
            </div>
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
          </Link>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- Activity -------------------------------- */

async function ActivityTab({ clientId }: { clientId: string }) {
  const items = await clientActivity(clientId, 50);
  return <ActivityList items={items} />;
}

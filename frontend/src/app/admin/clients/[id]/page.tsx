import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, CalendarClock, FileText, LifeBuoy, Mail, Phone, Plus, Table2 } from "lucide-react";
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
import { Kpi, PageHead, Panel } from "@/components/admin/ui/surface";
import { StatusChip } from "@/components/kit";
import { QueryTabs } from "@/components/admin/ui/tabs";
import { ERASURE_HOLD_DAYS } from "@/lib/privacy/erase";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { GroupedBars } from "@/components/charts";
import { Avatar } from "@/components/ui/avatar";
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
import { InviteContactButton } from "./invite-contact-button";
import { COLLEAGUE_ACCESS } from "@/lib/invitations-shared";

import { requireArea } from "@/lib/server-user";
import { PrivacyPanel } from "@/components/admin/client/privacy-panel";
import { AiModeTag } from "@/components/admin/client/client-table";
import { db } from "@/lib/db/client";
import {
  clientMember as memberTable,
  payment as paymentTable,
  serviceRequest as requestTable,
  serviceRequestDocument as docTable,
  user as userTable,
} from "@/lib/db/schema";
import { eq as eqOp, sql as sqlOp } from "drizzle-orm";

export const dynamic = "force-dynamic";

const TABS = ["overview", "requests", "billing", "files", "notes", "support", "activity", "privacy"] as const;
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
  await requireArea("clients", "/admin/clients");
  const { id } = await params;
  const tabParam = (await searchParams).tab;
  // Old tab names still open the right tab (links in emails and history).
  const OLD_TABS: Record<string, Tab> = { services: "requests", documents: "files" };
  const wanted = (tabParam && OLD_TABS[tabParam]) || tabParam;
  const tab: Tab = TABS.includes(wanted as Tab) ? (wanted as Tab) : "overview";

  const clientRow = await getClient(id);
  if (!clientRow) notFound();

  const [portalUser, invoices, requests, tickets, duplicates, members] = await Promise.all([
    getUserByIdOrEmail(clientRow.userId, clientRow.email),
    listClientInvoices(id),
    listClientRequests(id),
    listClientTickets(id),
    findDuplicateClients(clientRow.email, id),
    db
      .select({ id: userTable.id, name: userTable.name, email: userTable.email, access: memberTable.access })
      .from(memberTable)
      .innerJoin(userTable, eqOp(userTable.id, memberTable.userId))
      .where(eqOp(memberTable.clientId, id)),
  ]);

  const portalState = portalStatusOf(portalUser);
  const portal = PORTAL_BADGE[portalState];
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const realInvoices = invoices.filter((i) => i.kind === "invoice" && i.status !== "void" && i.status !== "draft");
  const lastYear = realInvoices.filter((i) => (i.issueDate || "") >= yearAgo);
  const billed12 = round2(lastYear.reduce((s, i) => s + num(i.total), 0));
  const unpaid = realInvoices.filter((i) => num(i.total) - num(i.amountPaid) > 0.005);
  const outstanding = round2(unpaid.reduce((s, i) => s + num(i.total) - num(i.amountPaid), 0));
  const overdueCount = unpaid.filter((i) => i.status === "overdue").length;
  const activeRequests = requests.filter(
    (r) => !TERMINAL_STATUSES.includes(r.status as (typeof TERMINAL_STATUSES)[number])
  );
  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "pending");
  const displayName = clientRow.company || clientRow.name;
  const firstName = (clientRow.name || displayName).split(" ")[0];

  // One line of facts under the name, as in the design: tax ID · address · client since.
  const facts = [
    clientRow.taxId ? `TIN/RC ${clientRow.taxId}` : null,
    clientRow.address,
    `client since ${formatDate(clientRow.createdAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const owner: Contact[] = portalUser
    ? [{ key: portalUser.id, name: portalUser.name || clientRow.name, line: `${portalUser.email} · owner`, email: portalUser.email }]
    : clientRow.email
      ? [{ key: "profile", name: clientRow.name, line: `${clientRow.email} · ${portal.label.toLowerCase()}`, email: clientRow.email }]
      : [];
  const contacts: Contact[] = [
    ...owner,
    ...members
      .filter((m) => m.id !== portalUser?.id)
      .map((m) => ({
        key: m.id,
        name: m.name || m.email,
        line: `${m.email} · ${(COLLEAGUE_ACCESS[m.access as keyof typeof COLLEAGUE_ACCESS]?.label ?? m.access).toLowerCase()}`,
        email: m.email,
      })),
  ];

  return (
    <div>
      <PageHead
        title={displayName}
        lede={<span className="text-[14px]">{facts}</span>}
        meta={
          <>
            <AiModeTag mode={clientRow.aiMode} />
            {portalState !== "active" && <Badge tone={portal.tone}>{portal.label}</Badge>}
            {duplicates.length > 0 && <Badge tone="warning">possible duplicate</Badge>}
            {clientRow.erasureRequestedAt && (
              <Badge tone="danger">
                Erasure on {formatDate(new Date(clientRow.erasureRequestedAt.getTime() + ERASURE_HOLD_DAYS * 86_400_000))}
              </Badge>
            )}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/billing/invoices/new?clientId=${id}`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-ctl border border-hairline bg-paper px-3.5 text-sm font-medium text-ink outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Plus className="size-4" /> New invoice
            </Link>
            <EditClientButton client={clientRow} />
            <ClientQuickActions
              clientId={id}
              clientName={displayName}
              canInvite={portalState === "no-account" && Boolean(clientRow.email)}
              duplicates={duplicates.map((d) => ({
                id: d.id,
                name: d.name,
                company: d.company,
                hasAccount: Boolean(d.userId),
                createdAt: (d.createdAt as Date).toISOString(),
              }))}
              aiConfigured={Boolean(process.env.LITCHAI_API_URL)}
            />
            {clientRow.email && (
              <a
                href={`mailto:${clientRow.email}`}
                className="keep-brand inline-flex min-h-[40px] items-center gap-1.5 rounded-ctl bg-brand px-3.5 text-sm font-semibold text-white outline-none transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Mail className="size-4" /> Email {firstName}
              </a>
            )}
          </div>
        }
      />

      <QueryTabs
        defaultValue="overview"
        tabs={[
          { label: "Overview", value: "overview" },
          { label: "Requests", value: "requests", count: requests.length },
          { label: "Billing", value: "billing", count: invoices.length },
          { label: "Files", value: "files" },
          { label: "Notes", value: "notes" },
          { label: "Privacy and data", value: "privacy" },
        ]}
      />

      <div className="mt-5 space-y-5">
        {tab === "overview" && (
          <OverviewTab
            clientId={id}
            clientName={displayName}
            email={clientRow.email}
            phone={clientRow.phone}
            notesText={clientRow.notes}
            requests={requests}
            openTickets={openTickets}
            contacts={contacts}
            kpis={{
              billed12,
              billedCount: lastYear.length,
              outstanding,
              unpaidCount: unpaid.length,
              overdueCount,
              open: activeRequests.length,
              openFirst: activeRequests[0]?.serviceName ?? null,
            }}
          />
        )}
        {tab === "requests" && <ServicesTab clientId={id} email={clientRow.email} requests={requests} />}
        {tab === "billing" && <BillingTab clientId={id} invoices={invoices} />}
        {tab === "files" && <DocumentsTab clientId={id} />}
        {tab === "notes" && <NotesTab clientId={id} />}
        {tab === "support" && <SupportTab tickets={tickets} />}
        {tab === "activity" && <ActivityTab clientId={id} />}
        {tab === "privacy" && (
          <PrivacyTab
            clientId={id}
            name={displayName}
            aiMode={clientRow.aiMode}
            reason={clientRow.aiModeReason}
            setBy={clientRow.aiModeSetBy}
            setAt={clientRow.aiModeSetAt ? clientRow.aiModeSetAt.toISOString() : null}
            erasureDueAt={clientRow.erasureRequestedAt ? new Date(clientRow.erasureRequestedAt.getTime() + ERASURE_HOLD_DAYS * 86_400_000).toISOString() : null}
            requests={requests.length}
            tickets={tickets.length}
            invoices={invoices.length}
          />
        )}
      </div>
    </div>
  );
}

type Contact = { key: string; name: string; line: string; email: string | null };
type ReqRow = Awaited<ReturnType<typeof listClientRequests>>[number];
const isClosed = (r: ReqRow) => TERMINAL_STATUSES.includes(r.status as (typeof TERMINAL_STATUSES)[number]);

/* --------------------------------- Overview -------------------------------- */

async function OverviewTab({
  clientId,
  clientName,
  email,
  phone,
  notesText,
  requests,
  openTickets,
  contacts,
  kpis,
}: {
  clientId: string;
  clientName: string;
  email: string | null;
  phone: string | null;
  notesText: string | null;
  requests: ReqRow[];
  openTickets: Awaited<ReturnType<typeof listClientTickets>>;
  contacts: Contact[];
  kpis: { billed12: number; billedCount: number; outstanding: number; unpaidCount: number; overdueCount: number; open: number; openFirst: string | null };
}) {
  const [consultations, notes, activity] = await Promise.all([
    listClientConsultations(clientId, email),
    listClientNotes(clientId),
    clientActivity(clientId, 6),
  ]);
  const upcoming = consultations.filter((c) => c.status !== "cancelled" && c.startsAt && (c.startsAt as Date) > new Date());
  // Open work first, then the most recent closed jobs.
  const shown = [...requests].sort((a, b) => Number(isClosed(a)) - Number(isClosed(b))).slice(0, 6);
  const latestNotes = notes.slice(0, 2);
  const linkCls = "text-sm font-medium text-accent hover:underline";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label="Billed, 12 months" value={formatMoney(kpis.billed12)} note={`${kpis.billedCount} ${kpis.billedCount === 1 ? "invoice" : "invoices"}`} />
          <Kpi
            label="Owes"
            value={formatMoney(kpis.outstanding)}
            note={kpis.outstanding <= 0 ? "All paid" : kpis.overdueCount ? `${kpis.overdueCount} overdue` : `${kpis.unpaidCount} unpaid`}
            noteTone={kpis.outstanding <= 0 ? "good" : kpis.overdueCount ? "bad" : "muted"}
            href={kpis.outstanding > 0 ? "?tab=billing" : undefined}
          />
          <Kpi label="Open" value={String(kpis.open)} note={kpis.openFirst ?? "No open requests"} />
        </div>

        <Panel
          title="Requests"
          action={requests.length > shown.length ? <Link href="?tab=requests" className={linkCls}>All {requests.length}</Link> : undefined}
          bodyClassName="p-0"
        >
          {shown.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Briefcase} title="No requests yet" description="Requests this client sends from the portal land here." />
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {shown.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/requests/${r.id}`} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface sm:px-5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{r.serviceName}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.number} · {isClosed(r) ? `closed ${formatDate(r.updatedAt)}` : `opened ${formatDate(r.createdAt)}`}
                      </span>
                    </span>
                    <StatusChip domain="request" status={r.status} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Activity" action={activity.length ? <Link href="?tab=activity" className={linkCls}>All activity</Link> : undefined} bodyClassName="p-0">
          {activity.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {activity.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface sm:px-5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{a.title}</span>
                      <span className="block truncate text-xs text-muted">{a.description}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{formatDateTime(a.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {upcoming.length > 0 && (
          <Panel title="Upcoming consultations" bodyClassName="p-0">
            <ul className="divide-y divide-hairline">
              {upcoming.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span className="flex items-center gap-3">
                    <CalendarClock className="size-4 text-muted" />
                    <span className="text-sm font-semibold text-ink">{c.startsAt ? formatDateTime(c.startsAt) : "Unscheduled"}</span>
                  </span>
                  {c.meetingUrl && (
                    <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-accent hover:underline">
                      Join call
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <div className="min-w-0 space-y-5">
        <Panel title="Contacts">
          {contacts.length === 0 ? (
            <p className="text-sm text-body">No contact yet. Use Edit to add an email.</p>
          ) : (
            <ul className="space-y-3">
              {contacts.map((c) => (
                <li key={c.key} className="flex items-center gap-3">
                  <Avatar name={c.name} email={c.email} size={9} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{c.name}</span>
                    <span className="block truncate text-xs text-muted">{c.line}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {phone && (
            <a href={`tel:${phone}`} className="mt-3 flex min-h-[32px] items-center gap-2 text-sm text-body hover:text-ink">
              <Phone className="size-4 text-muted" /> {phone}
            </a>
          )}
          <div className="mt-4">
            <InviteContactButton clientId={clientId} clientName={clientName} />
          </div>
        </Panel>

        <Panel title="Notes" action={<Link href="?tab=notes" className={linkCls}>{notes.length ? `All ${notes.length}` : "Add"}</Link>}>
          {latestNotes.length === 0 && !notesText ? (
            <p className="text-sm text-body">No notes yet. Notes are for the team only.</p>
          ) : (
            <div className="space-y-3">
              {notesText && <p className="whitespace-pre-line text-[13px] text-body">{notesText}</p>}
              {latestNotes.map((n) => (
                <div key={n.id}>
                  <p className="whitespace-pre-line text-[13px] text-body">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{formatDate(n.createdAt)} · team only</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {openTickets.length > 0 && (
          <Panel title="Open support" action={<Link href="?tab=support" className={linkCls}>All</Link>} bodyClassName="p-0">
            <ul className="divide-y divide-hairline">
              {openTickets.slice(0, 3).map((t) => (
                <li key={t.id}>
                  <Link href="/admin/help-desk" className="flex min-h-[48px] items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface sm:px-5">
                    <LifeBuoy className="size-4 shrink-0 text-muted" />
                    <span className="truncate text-ink">{t.subject}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Notes ---------------------------------- */

async function NotesTab({ clientId }: { clientId: string }) {
  const notes = await listClientNotes(clientId);
  return (
    <div className="max-w-2xl">
      <NotesRail clientId={clientId} notes={notes} />
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
                href={`/admin/billing/${inv.kind === "quote" ? "quotes" : "invoices"}/${inv.id}`}
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

async function PrivacyTab(props: {
  clientId: string;
  name: string;
  aiMode: string;
  reason: string | null;
  setBy: string | null;
  setAt: string | null;
  erasureDueAt: string | null;
  requests: number;
  tickets: number;
  invoices: number;
}) {
  const [[files], [pays]] = await Promise.all([
    db
      .select({ n: sqlOp<number>`count(*)` })
      .from(docTable)
      .innerJoin(requestTable, eqOp(requestTable.id, docTable.requestId))
      .where(eqOp(requestTable.clientId, props.clientId)),
    db.select({ n: sqlOp<number>`count(*)` }).from(paymentTable).where(eqOp(paymentTable.clientId, props.clientId)),
  ]);
  return (
    <PrivacyPanel
      clientId={props.clientId}
      name={props.name}
      aiMode={props.aiMode}
      reason={props.reason}
      setBy={props.setBy}
      setAt={props.setAt}
      erasureDueAt={props.erasureDueAt}
      counts={{ requests: props.requests, files: Number(files?.n ?? 0), tickets: props.tickets, invoices: props.invoices, payments: Number(pays?.n ?? 0) }}
    />
  );
}

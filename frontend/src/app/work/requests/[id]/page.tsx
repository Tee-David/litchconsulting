import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { StatusChip, EmptyState } from "@/components/kit";
import { PageHead, Panel, KV, Stepper, LinkTabs, Callout, Initials, linkBtn } from "@/components/dashboard/ui";
import { MessageThread, type ThreadMessage } from "@/components/dashboard/message-thread";
import { requestSteps, nowNext } from "@/components/dashboard/request-steps";
import { StaffAsks } from "@/components/work/staff-asks";
import { StaffDeliverables } from "@/components/work/staff-deliverables";
import { RequestTimeline } from "@/components/requests/request-timeline";
import { canWorkOnRequest, requireArea } from "@/lib/server-user";
import { staffRequestDetail } from "@/lib/requests/work";
import { INCLUDED_ROUNDS } from "@/lib/requests/review";
import { formatDate } from "@/lib/format-date";
import { replyAction } from "../../actions";

export const metadata: Metadata = { title: "Request" };
export const dynamic = "force-dynamic";

const TABS = ["overview", "asks", "deliverables", "messages", "activity"] as const;
type Tab = (typeof TABS)[number];
type Comment = { text?: string; anchor?: string };

export default async function StaffRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireArea("requests", "/work/requests");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!(await canWorkOnRequest(id))) {
    return (
      <Panel>
        <EmptyState
          icon={<ShieldOff />}
          title="This request is not assigned to you"
          why="You only see requests an admin has assigned to you. Ask them to add you if you need it."
          action={<Link href="/work/requests" className={linkBtn.secondary}>My requests</Link>}
        />
      </Panel>
    );
  }
  const d = await staffRequestDetail(id);
  if (!d) notFound();
  const { request: req, events, documents, items, rounds, payment, team, tickets } = d;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";
  const base = `/work/requests/${req.id}`;
  const supplied = items.filter((i) => i.status === "supplied").length;
  const open = items.filter((i) => i.status === "open").length;
  const deliverables = documents.filter((x) => x.kind === "deliverable");
  const uploads = documents.filter((x) => x.kind !== "deliverable");
  const closed = ["completed", "cancelled", "declined", "refunded"].includes(req.status);
  const latest = rounds[0] ?? null;
  const nn = nowNext(req.status, "firm");

  const messages: ThreadMessage[] = [...events]
    .reverse()
    .filter((e) => e.type === "message" || e.type === "note")
    .map((e) => ({ id: e.id, body: e.message ?? "", from: e.actorRole === "client" ? "client" : "firm", author: e.actorName, at: e.createdAt.toISOString(), internal: e.visibility === "internal" }));

  return (
    <div>
      <PageHead
        crumbs={[{ href: "/work/requests", label: "My requests" }, { label: req.number }]}
        title={req.client}
        chip={<StatusChip domain="request" status={req.status} suffix={req.status === "client_review" ? `round ${req.reviewRound}` : undefined} />}
        lede={`${req.number} · ${req.serviceName} · payment: ${payment}`}
      />

      {latest?.decision === "changes" && req.status === "in_progress" ? (
        <div className="mb-6">
          <Callout tone="warn" title={`The client asked for changes on draft ${latest.round}`} action={<Link className={linkBtn.small} href={`${base}?tab=deliverables`}>Deliverables</Link>}>
            <ul className="list-disc pl-5">
              {((Array.isArray(latest.comments) ? latest.comments : []) as Comment[]).map((c, i) => (
                <li key={i}>{c.anchor ? <b className="text-ink">{c.anchor}: </b> : null}{c.text}</li>
              ))}
            </ul>
          </Callout>
        </div>
      ) : null}
      {["pending_payment", "quote_sent", "quote_requested"].includes(req.status) ? (
        <div className="mb-6">
          <Callout tone="info" title="Not paid yet">Wait for the payment before starting work. The status changes on its own when it lands.</Callout>
        </div>
      ) : null}

      <LinkTabs
        label="Request sections"
        active={tab}
        tabs={[
          { id: "overview", label: "Overview", href: base },
          { id: "asks", label: "Asks and documents", href: `${base}?tab=asks`, count: supplied || open },
          { id: "deliverables", label: "Deliverables", href: `${base}?tab=deliverables`, count: deliverables.length },
          { id: "messages", label: "Messages", href: `${base}?tab=messages`, count: messages.length },
          { id: "activity", label: "Activity", href: `${base}?tab=activity` },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <Panel title="Progress">
              <Stepper steps={requestSteps({ status: req.status, reviewRound: req.reviewRound }, "firm")} />
              <p className="mt-4 text-sm text-body">
                <b className="text-ink">Now:</b> {nn.now}. <b className="text-ink">Next:</b> {nn.next}.
              </p>
            </Panel>
            <Panel title="Client brief">
              {req.details ? <p className="whitespace-pre-wrap text-sm text-body">{req.details}</p> : <p className="text-sm text-muted">No brief given.</p>}
            </Panel>
            <Panel title="Files from the client" sub={uploads.length ? String(uploads.length) : undefined}>
              {uploads.length ? (
                <ul className="divide-y divide-hairline">
                  {uploads.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.fileName}</span>
                      <span className="text-xs text-muted">{formatDate(f.createdAt)}</span>
                      {f.scanStatus === "infected" ? (
                        <span className="text-xs font-medium text-bad">Blocked</span>
                      ) : (
                        <a className={linkBtn.small} href={`/work/files/${f.id}`}>Download</a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-body">Nothing yet.</p>
              )}
            </Panel>
          </div>
          <aside className="space-y-6">
            <Panel title="Client">
              <KV rows={[["Company", req.clientCompany || "—"], ["Contact", req.clientName || "—"], ["Email", req.clientEmail || "—"], ["Phone", req.clientPhone || "—"]]} />
            </Panel>
            <Panel title="Work">
              <KV
                rows={[
                  ["Payment", payment],
                  ["Review round", req.reviewRound ? `${req.reviewRound} of ${INCLUDED_ROUNDS}` : "None yet"],
                  ["Requested", formatDate(req.createdAt)],
                  ["Open asks", String(open)],
                ]}
              />
            </Panel>
            <Panel title="Team">
              <ul className="space-y-2">
                {team.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm text-ink">
                    <Initials name={t.name} className="size-7 text-xs" /> {t.name}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Workbench">
              <p className="text-sm text-body">Work on this request&apos;s files in the workbench. Your access covers assigned requests only.</p>
              <Link className={`${linkBtn.small} mt-3`} href={`/work/analyses?r=${req.id}`}>Open files</Link>
            </Panel>
            {tickets.length ? (
              <Panel title="Support tickets">
                <ul className="space-y-1 text-sm">
                  {tickets.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-ink">{t.subject}</span>
                      <StatusChip domain="ticket" status={t.status} size="sm" />
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </aside>
        </div>
      ) : null}

      {tab === "asks" ? (
        <StaffAsks
          requestId={req.id}
          canAsk={!closed}
          items={items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, detail: i.detail, status: i.status, dueAt: i.dueAt?.toISOString() ?? null, answer: i.answer, documentId: i.documentId, suppliedAt: i.suppliedAt?.toISOString() ?? null }))}
        />
      ) : null}

      {tab === "deliverables" ? (
        <StaffDeliverables
          requestId={req.id}
          status={req.status}
          canSend={["in_progress", "in_review"].includes(req.status)}
          files={deliverables.map((f) => ({ id: f.id, fileName: f.fileName, stage: f.stage, createdAt: f.createdAt.toISOString(), by: f.uploadedByName, inRound: rounds.find((r) => r.documentId === f.id)?.round ?? null }))}
        />
      ) : null}

      {tab === "messages" ? (
        <Panel title="Conversation with the client">
          <MessageThread messages={messages} viewer="firm" allowInternal closed={closed} send={replyAction.bind(null, req.id)} placeholder={`Write to ${req.clientName || "the client"}`} />
        </Panel>
      ) : null}

      {tab === "activity" ? (
        <div className="max-w-3xl">
          <RequestTimeline events={events} />
        </div>
      ) : null}
    </div>
  );
}

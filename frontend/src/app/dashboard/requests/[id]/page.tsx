import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Eye, FileText, PackageCheck, ReceiptText, RotateCcw, Upload, Wallet, MessageSquare } from "lucide-react";
import { StatusChip, EmptyState } from "@/components/kit";
import { PageHead, Panel, KV, Stepper, NextMove, LinkTabs, Callout, Initials, linkBtn } from "@/components/dashboard/ui";
import { FileLink } from "@/components/dashboard/file-link";
import { AsksList } from "@/components/dashboard/asks-list";
import { MessageThread, type ThreadMessage } from "@/components/dashboard/message-thread";
import { requestSteps, nowNext } from "@/components/dashboard/request-steps";
import { RequestTimeline } from "@/components/requests/request-timeline";
import { DocsChecklist } from "@/components/requests/docs-checklist";
import { getPortal, clientRequestDetail } from "@/lib/requests/portal";
import { INCLUDED_ROUNDS } from "@/lib/requests/review";
import { formatMoney } from "@/lib/invoice/money";
import { balanceOf, depositOf, isPayable } from "@/lib/payments/amounts";
import { formatDate } from "@/lib/format-date";
import type { RequiredDocument } from "@/lib/services/catalog";
import { RequestActions } from "./request-actions";
import { sendRequestMessageAction } from "../flow-actions";

export const metadata: Metadata = { title: "Request" };
export const dynamic = "force-dynamic";

const TABS = ["overview", "asks", "files", "messages", "activity"] as const;
type Tab = (typeof TABS)[number];

export default async function ClientRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; paid?: string; payfail?: string; payflag?: string }>;
}) {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/requests");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await clientRequestDetail(id, portal.client.id);
  if (!d) notFound();
  const { request: req, quote, invoice: inv, items, rounds, team, parent, documents, events } = d;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";
  const who = team[0]?.name ?? "We";
  const openItems = items.filter((i) => i.status === "open");
  const deliverables = documents.filter((x) => x.kind === "deliverable");
  const uploads = documents.filter((x) => x.kind === "client_upload");
  const required = (req.requiredDocuments as RequiredDocument[]) ?? [];
  const canUpload = ["awaiting_documents", "in_progress", "in_review", "client_review"].includes(req.status);
  const closed = ["completed", "cancelled", "declined", "refunded"].includes(req.status);
  const transferPending = d.payments.some((p) => p.provider === "bank_transfer" && p.status === "pending");
  const base = `/dashboard/requests/${req.id}`;

  const messages: ThreadMessage[] = [...events]
    .reverse()
    .filter((e) => e.type === "message" || (e.type === "note" && e.actorRole !== "client"))
    .map((e) => ({ id: e.id, body: e.message ?? "", from: e.actorRole === "client" ? "client" : "firm", author: e.actorName, at: e.createdAt.toISOString() }));

  // The one move that matters most right now.
  let move: React.ReactNode = null;
  if (req.status === "quote_sent" && quote) {
    move = (
      <NextMove
        icon={<ReceiptText />}
        title="Your move: review the quote"
        body={`${quote.number} · ${formatMoney(Number(quote.total), quote.currency)}. Accepting creates your invoice and pay link.`}
        action={<Link className={linkBtn.primary} href={`/dashboard/quotes/${quote.id}`}>Review quote</Link>}
      />
    );
  } else if (inv && isPayable(inv) && !transferPending && (req.status === "pending_payment" || inv.status === "partially_paid")) {
    const dep = depositOf(inv);
    move = (
      <NextMove
        icon={<Wallet />}
        title={dep !== null ? "Your move: pay the deposit" : req.status === "pending_payment" ? "Your move: pay to start" : "Balance due"}
        body={`${inv.number} · ${formatMoney(dep ?? balanceOf(inv), inv.currency)} by card, bank app or transfer.`}
        action={<Link className={linkBtn.primary} href={`/dashboard/billing/pay?invoice=${inv.id}`}>{dep !== null ? "Pay deposit" : "Pay now"}</Link>}
      />
    );
  } else if (req.status === "client_review") {
    move = (
      <NextMove
        icon={<Eye />}
        title={`Your move: review draft ${req.reviewRound}`}
        body={`Round ${req.reviewRound} of ${INCLUDED_ROUNDS} included. Approve it, or tell us what to change.`}
        action={<Link className={linkBtn.primary} href={`${base}/review`}>Review draft</Link>}
      />
    );
  } else if (openItems.length) {
    move = (
      <NextMove
        icon={<Upload />}
        title={`Your move: ${openItems.length === 1 ? openItems[0].title : `${openItems.length} things we need`}`}
        body={`${who} needs ${openItems.length === 1 ? "this" : "these"} to carry on.`}
        action={<Link className={linkBtn.primary} href={`${base}/asks`}>{openItems.length === 1 && openItems[0].kind === "info" ? "Answer" : "Open"}</Link>}
      />
    );
  } else if (req.status === "awaiting_documents") {
    move = <NextMove icon={<Upload />} title="Your move: upload your documents" body="We start as soon as the required files are in." action={<Link className={linkBtn.primary} href={`${base}?tab=files`}>Upload</Link>} />;
  } else if (req.status === "delivered") {
    move = (
      <NextMove
        icon={<PackageCheck />}
        title="Your final files are ready"
        body="Download them from Files. When you are happy, confirm to close the request."
        action={<Link className={linkBtn.secondary} href={`${base}?tab=files`}>See files</Link>}
      />
    );
  }

  const nn = nowNext(req.status);

  return (
    <div>
      <PageHead
        crumbs={[{ href: "/dashboard/requests", label: "Requests" }, { label: req.number }]}
        title={req.serviceName}
        chip={<StatusChip domain="request" status={req.status} audience="client" suffix={req.status === "client_review" ? `round ${req.reviewRound} of ${INCLUDED_ROUNDS}` : undefined} />}
        lede={`${req.number}${team.length ? ` · with ${team.map((t) => t.name).join(", ")}` : ""}${parent ? ` · follow-on to ${parent.number}` : ""}`}
        actions={<RequestActions requestId={req.id} requestNumber={req.number} status={req.status} pricingMode={req.pricingMode} />}
      />

      {sp.paid ? <div className="mb-6"><Callout tone="good" title="Payment received. Thank you.">Your receipt is in Billing and in your email. {required.length ? "Next: upload your documents." : "We are on it."}</Callout></div> : null}
      {sp.payfail && req.status === "pending_payment" ? <div className="mb-6"><Callout tone="warn" title="Your payment did not complete">No money left your account. Try again, or pay by bank transfer.</Callout></div> : null}
      {sp.payflag ? <div className="mb-6"><Callout tone="warn" title="We are checking your payment">It needs a quick manual check. We will confirm by email; nothing more to do.</Callout></div> : null}
      {transferPending ? <div className="mb-6"><Callout tone="info" title="We are checking your bank transfer">We confirm within a working day and email you. Work starts once it is confirmed.</Callout></div> : null}
      {req.status === "declined" || req.status === "cancelled" ? (
        <div className="mb-6">
          <Callout tone="info" title={req.status === "declined" ? "You declined this quote" : "This request was cancelled"} action={<Link className={linkBtn.small} href={`/dashboard/requests/new?from=${req.id}`}><RotateCcw className="size-3.5" aria-hidden /> Request again</Link>}>
            {req.cancelReason ? `Reason: ${req.cancelReason}` : "Nothing more to do."}
          </Callout>
        </div>
      ) : null}

      {move}

      <LinkTabs
        label="Request sections"
        active={tab}
        tabs={[
          { id: "overview", label: "Overview", href: base },
          { id: "asks", label: "What we need", href: `${base}?tab=asks`, count: openItems.length },
          { id: "files", label: "Files", href: `${base}?tab=files`, count: documents.length },
          { id: "messages", label: "Messages", href: `${base}?tab=messages`, count: messages.length },
          { id: "activity", label: "Activity", href: `${base}?tab=activity` },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <Panel title="Progress" tour="request-stepper">
              <Stepper steps={requestSteps({ status: req.status, pricingMode: req.pricingMode, reviewRound: req.reviewRound, depositPercent: inv?.depositPercent })} />
              <p className="mt-4 text-sm text-body">
                <b className="text-ink">Now:</b> {nn.now}. <b className="text-ink">Next:</b> {nn.next}.
              </p>
            </Panel>
            <Panel title="We asked you for" sub={openItems.length ? `${openItems.length} open` : undefined} right={items.length ? <Link className={linkBtn.ghost} href={`${base}/asks`}>Open all</Link> : null}>
              {items.length ? (
                <ul className="divide-y divide-hairline">
                  {items.slice(0, 5).map((it) => (
                    <li key={it.id} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{it.title}</span>
                        <span className="block text-xs text-muted">{it.status === "open" && it.dueAt ? `Due ${formatDate(it.dueAt)}` : it.kind === "document" ? "Document" : "Question"}</span>
                      </span>
                      {it.status === "open" ? (
                        <Link className={linkBtn.small} href={`${base}/asks#item-${it.id}`}>{it.kind === "document" ? "Upload" : "Answer"}</Link>
                      ) : (
                        <StatusChip domain="item" status={it.status} audience="client" size="sm" />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-body">Nothing yet. If we need a document or an answer, it appears here.</p>
              )}
            </Panel>
            <Panel title="Messages" right={<Link className={linkBtn.ghost} href={`${base}?tab=messages`}>Open</Link>}>
              <MessageThread messages={messages.slice(-3)} viewer="client" send={sendRequestMessageAction.bind(null, req.id)} placeholder={`Write to ${team[0]?.name ?? "the team"}`} closed={closed} />
            </Panel>
          </div>
          <aside className="space-y-6">
            <Panel title="Billing">
              {inv ? (
                <>
                  <KV
                    rows={[
                      ["Invoice", inv.number],
                      ["Total", formatMoney(Number(inv.total), inv.currency)],
                      ["Paid", formatMoney(Number(inv.amountPaid ?? 0), inv.currency)],
                      ["Balance", balanceOf(inv) > 0 ? `${formatMoney(balanceOf(inv), inv.currency)}${inv.status === "partially_paid" ? " on delivery" : ""}` : "Nothing due"],
                    ]}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link className={linkBtn.small} href={`/dashboard/invoices/${inv.id}`}>View invoice</Link>
                    {inv.status === "paid" ? <a className={linkBtn.small} href={`/api/dashboard/invoices/${inv.id}/pdf?variant=receipt`}>Receipt</a> : null}
                  </div>
                </>
              ) : quote ? (
                <KV rows={[["Quote", quote.number], ["Total", formatMoney(Number(quote.total), quote.currency)], ["Status", <StatusChip key="s" domain="quote" status={quote.status} audience="client" size="sm" />]]} />
              ) : (
                <p className="text-sm text-body">{req.status === "quote_requested" ? "We are preparing your quote, usually within a working day." : "No invoice yet."}</p>
              )}
            </Panel>
            <Panel title="Files" right={<Link className={linkBtn.ghost} href={`${base}?tab=files`}>All</Link>}>
              {documents.length ? (
                <ul className="space-y-1 text-sm">
                  {documents.slice(0, 5).map((f) => (
                    <li key={f.id} className="flex items-center gap-2 truncate text-body">
                      <FileText className="size-3.5 shrink-0 text-muted" aria-hidden />
                      <span className="truncate">{f.fileName}</span>
                      <span className="shrink-0 text-xs text-muted">· {f.kind === "deliverable" ? (f.stage === "draft" ? "draft" : "from us") : "yours"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-body">No files yet.</p>
              )}
            </Panel>
            {team.length ? (
              <Panel title="Working on it">
                <ul className="space-y-3">
                  {team.map((t) => (
                    <li key={t.id} className="flex items-center gap-3">
                      <Initials name={t.name} />
                      <span className="text-sm font-medium text-ink">{t.name}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
            {req.details ? (
              <Panel title="Your brief">
                <p className="whitespace-pre-wrap text-sm text-body">{req.details}</p>
              </Panel>
            ) : null}
          </aside>
        </div>
      ) : null}

      {tab === "asks" ? (
        <AsksList
          requestId={req.id}
          who={who}
          items={items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, detail: i.detail, status: i.status, dueAt: i.dueAt?.toISOString() ?? null, answer: i.answer, suppliedAt: i.suppliedAt?.toISOString() ?? null, receivedAt: i.receivedAt?.toISOString() ?? null }))}
        />
      ) : null}

      {tab === "files" ? (
        <div className="space-y-6">
          <Panel title="From us" sub={deliverables.length ? String(deliverables.length) : undefined}>
            {deliverables.length ? (
              <ul className="grid gap-2 md:grid-cols-2">
                {deliverables.map((f) => (
                  <li key={f.id}>
                    <FileLink
                      href={`/api/dashboard/files/${f.id}`}
                      name={f.fileName}
                      meta={`${f.stage === "draft" ? "Draft, not final" : "Final"} · ${formatDate(f.createdAt)}`}
                      chip={<StatusChip domain="deliverable" status={f.stage === "draft" ? "draft" : "final"} audience="client" size="sm" />}
                      blocked={f.scanStatus === "infected"}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title="Nothing from us yet" why="Drafts and final files appear here as soon as we send them." />
            )}
          </Panel>
          {canUpload || required.length ? (
            <DocsChecklist requestId={req.id} required={required} documents={uploads} canUpload={canUpload} />
          ) : (
            <Panel title="From you">
              {uploads.length ? (
                <ul className="grid gap-2 md:grid-cols-2">
                  {uploads.map((f) => (
                    <li key={f.id}>
                      <FileLink href={`/api/dashboard/files/${f.id}`} name={f.fileName} meta={formatDate(f.createdAt)} blocked={f.scanStatus === "infected"} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-body">{req.status === "pending_payment" || req.status.startsWith("quote") ? "Uploads open once the work starts." : "You have not sent files on this request."}</p>
              )}
            </Panel>
          )}
        </div>
      ) : null}

      {tab === "messages" ? (
        <Panel title={`Messages${team[0] ? ` with ${team[0].name}` : ""}`} right={<MessageSquare className="size-4 text-muted" aria-hidden />}>
          <MessageThread messages={messages} viewer="client" send={sendRequestMessageAction.bind(null, req.id)} placeholder={`Write to ${team[0]?.name ?? "the team"}`} closed={closed} />
        </Panel>
      ) : null}

      {tab === "activity" ? (
        <div className="max-w-3xl">
          <RequestTimeline events={events} />
          {rounds.length ? (
            <Panel title="Review rounds" className="mt-6">
              <ul className="divide-y divide-hairline text-sm">
                {rounds.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <b className="text-ink">Round {r.round}</b> · sent {formatDate(r.sentAt)} ·{" "}
                    {r.decision === "approved" ? "you approved it" : r.decision === "changes" ? "you asked for changes" : "waiting for you"}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Eye, FileText, Layers, Lock, Plus, ShieldCheck, Table2 } from "lucide-react";
import { requireArea } from "@/lib/server-user";
import { StatusChip } from "@/components/kit";
import { ActLink, KeyValues, LinkTabs, PageHead, Panel } from "@/components/admin/ui/surface";
import { RequestTimeline } from "@/components/requests/request-timeline";
import { AsksPanel, AssignCard, DeliverablesPanel, NoteComposer, OpenMoveButton, RequestHeaderActions } from "@/components/admin/requests/detail";
import { formatMoney, num } from "@/lib/invoice/money";
import type { RequiredDocument } from "@/lib/services/catalog";
import { listTeam, nextStepFor, requestDetail, isClosed } from "../../_lib/requests-data";
import { AdminDocumentList } from "./admin-document-list";
import { AiAnalysisCard } from "./ai-analysis-card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = ["overview", "items", "deliverables", "billing", "activity"] as const;
type Tab = (typeof TABS)[number];

const STEPS: Array<{ label: string; statuses: string[] }> = [
  { label: "Requested", statuses: ["quote_requested", "quote_sent"] },
  { label: "Payment", statuses: ["pending_payment"] },
  { label: "Documents", statuses: ["awaiting_documents"] },
  { label: "In progress", statuses: ["in_progress", "in_review"] },
  { label: "Client review", statuses: ["client_review"] },
  { label: "Delivered", statuses: ["delivered"] },
  { label: "Completed", statuses: ["completed"] },
];

const date = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" }) : "");

export default async function AdminRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; assign?: string }> }) {
  await requireArea("requestsAll", "/admin/requests");
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";
  const [d, team] = await Promise.all([requestDetail(id), listTeam()]);
  if (!d) notFound();
  const { request: r, client: c } = d;
  const clientName = c?.company || c?.name || "Unknown client";
  const closed = isClosed(r.status);

  const items = d.items.map((i) => ({
    id: i.id,
    kind: i.kind,
    title: i.title,
    detail: i.detail,
    status: i.status,
    answer: i.answer,
    dueAt: i.dueAt?.toISOString() ?? null,
    suppliedAt: i.suppliedAt?.toISOString() ?? null,
    receivedAt: i.receivedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  }));
  const openItems = items.filter((i) => i.status === "open").length;
  const supplied = items.filter((i) => i.status === "supplied").length;
  const uploads = d.documents.filter((x) => x.kind === "client_upload");
  const deliverables = d.documents.filter((x) => x.kind === "deliverable");
  const files = deliverables.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    stage: f.stage,
    createdAt: f.createdAt.toISOString(),
    by: f.uploadedByName,
    sizeBytes: f.sizeBytes,
    variant: f.publishVariant,
  }));
  const rounds = d.rounds.map((x) => ({
    round: x.round,
    fileName: deliverables.find((f) => f.id === x.documentId)?.fileName ?? null,
    sentAt: x.sentAt.toISOString(),
    decision: x.decision,
    decidedAt: x.decidedAt?.toISOString() ?? null,
    comments: Array.isArray(x.comments) ? (x.comments as Array<{ text?: string }>).map((c) => c.text).filter(Boolean).join(" · ") || null : null,
  }));
  const mainInvoice = d.invoices.find((i) => i.id === r.invoiceId) ?? null;
  const balanceInvoice = d.invoices.find((i) => i.parentInvoiceId === r.invoiceId) ?? null;
  const value = mainInvoice ? num(mainInvoice.total) : r.priceSnapshot ? num(r.priceSnapshot) : null;

  const stepIdx = STEPS.findIndex((s) => s.statuses.includes(r.status));
  const label = `${r.number} · ${clientName}`;
  const first = (c?.name || "the client").split(" ")[0];

  /* The one next step, and whose move it is. */
  const next: { tone: "us" | "client" | "done"; title: string; body: string; action?: React.ReactNode } = (() => {
    if (supplied)
      return { tone: "us", title: `${first} supplied ${supplied} ${supplied === 1 ? "item" : "items"}`, body: "Check them and mark them received, or ask again.", action: <ActLink href={`/admin/requests/${r.id}?tab=items`}>Check items</ActLink> };
    switch (r.status) {
      case "quote_requested":
        return {
          tone: "us",
          title: "Write the quote",
          body: `${first} is waiting for a price. Accepting it creates the invoice and pay link.`,
          action: mainInvoice ? <ActLink href={`/admin/billing/invoices/${mainInvoice.id}`}>Open {mainInvoice.number}</ActLink> : <ActLink href={`/admin/billing/invoices/new?requestId=${r.id}`}>Create quote invoice</ActLink>,
        };
      case "quote_sent":
        return { tone: "client", title: `Waiting on ${first} to accept the quote`, body: "Follow up from Home if there is no answer in a few days." };
      case "pending_payment":
        return { tone: "client", title: `Waiting on ${first} to pay`, body: mainInvoice ? `${mainInvoice.number}, ${formatMoney(num(mainInvoice.total) - num(mainInvoice.amountPaid), mainInvoice.currency)} due.` : "Link an invoice so the client can pay.", action: mainInvoice ? <ActLink variant="secondary" href={`/admin/billing/invoices/${mainInvoice.id}`}>Open invoice</ActLink> : undefined };
      case "awaiting_documents":
        return { tone: "client", title: `Waiting on ${first} for documents`, body: openItems ? `${openItems} ${openItems === 1 ? "ask is" : "asks are"} open.` : "Their required documents are not all in yet.", action: <ActLink variant="secondary" href={`/admin/requests/${r.id}?tab=items`}>See what is missing</ActLink> };
      case "in_progress":
        return { tone: "us", title: "Prepare the draft", body: "Upload a draft in Deliverables and send it for review, or send it for internal review first.", action: <ActLink href={`/admin/requests/${r.id}?tab=deliverables`}>Go to deliverables</ActLink> };
      case "in_review":
        return { tone: "us", title: "Approve the draft internally", body: "When it is right, send it to the client for review from Deliverables.", action: <ActLink href={`/admin/requests/${r.id}?tab=deliverables`}>Review draft</ActLink> };
      case "client_review":
        return { tone: "client", title: `Waiting on ${first}: review the draft`, body: `Round ${Math.max(1, r.reviewRound)}. They approve it or ask for changes. Home flags it if there is no answer in 3 days.`, action: <OpenMoveButton requestId={r.id} number={r.number} status={r.status} label="Move to…" /> };
      case "delivered":
        return { tone: "client", title: "Delivered. Close it when the balance is paid", body: balanceInvoice ? `Balance ${balanceInvoice.number} is ${balanceInvoice.status}.` : "No balance invoice. Close the request when you are done.", action: <OpenMoveButton requestId={r.id} number={r.number} status={r.status} label="Move to…" variant="secondary" /> };
      default:
        return { tone: "done", title: closed ? `This request is ${r.status === "completed" ? "complete" : r.status}` : nextStepFor(r.status), body: r.cancelReason ? `Reason: ${r.cancelReason}` : "Nothing else to do." };
    }
  })();

  const tabs = [
    { id: "overview", label: "Overview", href: `/admin/requests/${r.id}` },
    { id: "items", label: "Asks and documents", href: `/admin/requests/${r.id}?tab=items`, count: openItems + supplied },
    { id: "deliverables", label: "Deliverables", href: `/admin/requests/${r.id}?tab=deliverables`, count: deliverables.length },
    { id: "billing", label: "Billing", href: `/admin/requests/${r.id}?tab=billing` },
    { id: "activity", label: "Activity", href: `/admin/requests/${r.id}?tab=activity` },
  ];

  const stepper = (
    <ol className="grid grid-cols-1 gap-2 sm:grid-cols-7 sm:gap-0" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = !closed || r.status === "completed" ? i < stepIdx || r.status === "completed" : false;
        const cur = i === stepIdx && r.status !== "completed";
        return (
          <li key={s.label} className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-1.5" aria-current={cur ? "step" : undefined}>
            <span className="flex w-full items-center">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold",
                  done ? "border-good bg-good text-white" : cur ? "border-warn bg-paper text-warn" : "border-line-strong bg-paper text-muted",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              {i < STEPS.length - 1 && <span aria-hidden className={cn("mx-1 hidden h-0.5 flex-1 sm:block", done ? "bg-good" : "bg-hairline")} />}
            </span>
            <span className={cn("text-[13px]", cur ? "font-semibold text-ink" : done ? "text-ink" : "text-muted")}>
              {s.label}
              {s.label === "Client review" && r.reviewRound > 0 ? <span className="block text-xs font-normal text-muted">round {r.reviewRound}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );

  const rail = (
    <div className="space-y-4">
      <section className="rounded-card border border-hairline bg-paper p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <b className="truncate font-display text-ink">{clientName}</b>
          <Link href={`/admin/clients/${r.clientId}`} className="shrink-0 text-sm font-medium text-accent hover:underline">
            Client
          </Link>
        </div>
        <KeyValues
          rows={[
            ["Contact", c?.name || "—"],
            ["Email", c?.email || "—"],
            ["TIN", c?.taxId || "—"],
            [
              "AI mode",
              c?.aiMode === "local_only" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-soft px-2 py-0.5 text-xs font-medium text-violet">
                  <Lock className="size-3" /> Local only
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-body">
                  <ShieldCheck className="size-3" /> Cloud, masked
                </span>
              ),
            ],
            ["Value", value ? formatMoney(value, r.currency) : "Quote"],
          ]}
        />
      </section>
      <AssignCard
        requestId={r.id}
        label={label}
        team={team}
        legacy={r.assignee}
        initialOpen={sp.assign === "1"}
        assignees={d.assignees.map((a) => ({ userId: a.userId, name: a.name, role: a.role, at: a.at.toISOString() }))}
      />
      <section className="rounded-card border border-hairline bg-paper p-4 text-sm">
        <h3 className="mb-2 font-semibold text-ink">Work on the files</h3>
        <p className="mb-3 text-body">Open client spreadsheets in the workbench with Sage beside you, scoped by this client&rsquo;s AI mode.</p>
        <ActLink variant="secondary" href={`/admin/analyses?requestId=${r.id}`}>
          <Table2 /> Open in workbench
        </ActLink>
      </section>
      {(d.parent || d.followOns.length > 0) && (
        <section className="rounded-card border border-hairline bg-paper p-4 text-sm">
          <h3 className="mb-2 font-semibold text-ink">Related</h3>
          <ul className="space-y-2">
            {d.parent && (
              <li>
                <Link href={`/admin/requests/${d.parent.id}`} className="flex items-center gap-2 hover:underline">
                  <Layers className="size-4 text-muted" />
                  <span className="min-w-0">
                    <b className="block text-ink">Parent: {d.parent.number}</b>
                    <span className="text-muted">{d.parent.service}</span>
                  </span>
                </Link>
              </li>
            )}
            {d.followOns.map((f) => (
              <li key={f.id}>
                <Link href={`/admin/requests/${f.id}`} className="flex items-center gap-2 hover:underline">
                  <Plus className="size-4 text-muted" />
                  <span className="min-w-0">
                    <b className="block text-ink">Follow-on: {f.number}</b>
                    <span className="text-muted">{f.service}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  const nextCard = (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center sm:p-5",
        next.tone === "us" ? "border-act/40 bg-brand-tint" : next.tone === "client" ? "border-hairline bg-paper" : "border-hairline bg-surface",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-ctl bg-paper text-accent">
        <Eye className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">{next.tone === "us" ? "Our move" : next.tone === "client" ? "Waiting on the client" : "Closed"}</p>
        <h2 className="font-display text-base font-semibold text-ink">{next.title}</h2>
        <p className="text-sm text-body">{next.body}</p>
      </div>
      {next.action ? <div className="flex shrink-0 flex-wrap gap-2">{next.action}</div> : null}
    </div>
  );

  let main: React.ReactNode;
  if (tab === "overview") {
    main = (
      <div className="space-y-5">
        {nextCard}
        <Panel title="Progress">{stepper}</Panel>
        {r.details || r.intake ? (
          <Panel title="The brief">
            {r.details ? <p className="whitespace-pre-line text-sm text-body">{r.details}</p> : null}
            {r.intake ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(r.intake as Record<string, string>).map(([k, v]) =>
                  v ? (
                    <span key={k} className="rounded-full border border-hairline px-3 py-1 text-xs text-body">
                      {k}: {String(v)}
                    </span>
                  ) : null,
                )}
              </div>
            ) : null}
          </Panel>
        ) : null}
        <Panel title="Asks" sub={openItems ? `${openItems} open` : undefined}>
          <AsksPanel requestId={r.id} clientName={clientName} items={items} closed={closed} />
        </Panel>
        {process.env.LITCHAI_API_URL && uploads.length > 0 ? (
          <AiAnalysisCard
            requestId={r.id}
            documents={uploads.map((u) => ({ id: u.id, fileName: u.fileName, litchaiDocumentId: u.litchaiDocumentId, litchaiStatus: u.litchaiStatus }))}
          />
        ) : null}
        <RequestTimeline events={d.events.slice(0, 6)} />
      </div>
    );
  } else if (tab === "items") {
    main = (
      <div className="space-y-5">
        <Panel title="Asks and documents" sub={`${items.filter((i) => i.status !== "cancelled").length}`}>
          <AsksPanel requestId={r.id} clientName={clientName} items={items} closed={closed} />
        </Panel>
        <AdminDocumentList requestId={r.id} required={(r.requiredDocuments as RequiredDocument[]) ?? []} clientUploads={uploads} deliverables={[]} />
      </div>
    );
  } else if (tab === "deliverables") {
    main = (
      <div className="space-y-5">
        <Panel title="Deliverables" sub={files.length ? `${files.filter((f) => f.stage === "draft").length} drafts, ${files.filter((f) => f.stage !== "draft").length} final` : undefined}>
          <DeliverablesPanel requestId={r.id} status={r.status} files={files} rounds={rounds} />
        </Panel>
      </div>
    );
  } else if (tab === "billing") {
    main = (
      <div className="space-y-5">
        <Panel title="Money" action={<Link href="/admin/billing" className="text-sm font-medium text-accent hover:underline">Billing</Link>}>
          {d.invoices.length === 0 ? (
            <div className="space-y-3 text-sm text-body">
              <p>No invoice or quote is linked to this request yet.</p>
              <ActLink href={`/admin/billing/invoices/new?requestId=${r.id}`}>
                <FileText /> Create {r.pricingMode === "quote" ? "quote" : "invoice"}
              </ActLink>
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {d.invoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/billing/${inv.kind === "quote" ? "quotes" : "invoices"}/${inv.id}`} className="font-medium text-accent hover:underline">
                      {inv.number}
                    </Link>
                    <p className="text-sm text-body">
                      {inv.kind === "quote" ? "Quote" : inv.depositPercent ? `Deposit invoice, ${inv.depositPercent}%` : inv.parentInvoiceId ? "Balance invoice" : "Invoice"} · issued {date(inv.issueDate)}
                    </p>
                  </div>
                  <StatusChip domain={inv.kind === "quote" ? "quote" : "invoice"} status={inv.status} size="sm" />
                  <span className="text-right text-sm tabular-nums">
                    <b className="block text-ink">{formatMoney(num(inv.total), inv.currency)}</b>
                    {num(inv.amountPaid) > 0 && <span className="text-muted">{formatMoney(num(inv.amountPaid), inv.currency)} paid</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Payments">
          {d.payments.length === 0 ? (
            <p className="text-sm text-body">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-hairline text-sm">
              {d.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0 flex-1">
                    <span className="block text-ink">{p.proofKey ? "Bank transfer" : p.provider === "paystack" ? `Paystack${p.channel ? `, ${p.channel}` : ""}` : "Recorded by hand"}</span>
                    <span className="block font-mono text-xs text-muted">{p.reference}</span>
                  </span>
                  <StatusChip domain="payment" status={p.proofKey && !p.confirmedAt && !["rejected", "success"].includes(p.status) ? "proof" : p.status} size="sm" />
                  <span className="tabular-nums text-ink">{formatMoney(num(p.amountSettled ?? p.amount), p.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    );
  } else {
    main = (
      <div className="space-y-4">
        <NoteComposer requestId={r.id} />
        {d.events.length ? <RequestTimeline events={d.events} /> : <p className="text-sm text-body">No activity yet.</p>}
        <p className="text-xs text-muted">Team notes never reach the client. Everything else also shows on the client&rsquo;s timeline.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHead
        title={r.serviceName}
        lede={`${r.number} · ${clientName} · opened ${date(r.createdAt)}`}
        meta={<StatusChip domain="request" status={r.status} suffix={r.status === "client_review" ? `round ${Math.max(1, r.reviewRound)}` : undefined} />}
        actions={<RequestHeaderActions requestId={r.id} number={r.number} status={r.status} clientName={clientName} />}
      />
      <LinkTabs label="Request sections" active={tab} tabs={tabs} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">{main}</div>
        {rail}
      </div>
    </div>
  );
}

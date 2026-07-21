import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, AlertTriangle, Landmark, ReceiptText } from "lucide-react";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { getClientRequest } from "@/lib/db/queries/requests";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { Badge } from "@/components/admin/ui/badge";
import { requestStatusTone, STATUS_LABELS, type RequestStatus, type StepLabelOverrides } from "@/lib/requests/status";
import { RequestProgressTracker } from "@/components/requests/progress-tracker";
import { RequestTimeline } from "@/components/requests/request-timeline";
import { RequestMessageBox } from "@/components/requests/request-message-box";
import { DocsChecklist } from "@/components/requests/docs-checklist";
import { DeliverablesCard } from "@/components/requests/deliverables-card";
import { PayButton } from "@/components/pay/pay-button";
import { formatMoney, num } from "@/lib/invoice/money";
import { formatDate } from "@/lib/format-date";
import { RequestActions } from "./request-actions";
import type { RequiredDocument } from "@/lib/services/catalog";
import type { ServiceRequestEvent } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Derive milestone completion timestamps from the event feed. */
function milestoneTimes(events: ServiceRequestEvent[], createdAt: Date) {
  const asc = [...events].reverse();
  const firstOf = (pred: (e: ServiceRequestEvent) => boolean) =>
    asc.find(pred)?.createdAt ?? undefined;
  return {
    requested: createdAt,
    payment: firstOf((e) => e.type === "payment_received"),
    documents: firstOf((e) => e.type === "documents_complete"),
    in_progress: firstOf((e) => e.type === "status_changed" && e.toStatus === "in_progress"),
    delivered: firstOf(
      (e) => e.type === "deliverable_uploaded" || (e.type === "status_changed" && e.toStatus === "delivered")
    ),
  };
}

export default async function ClientRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string; payfail?: string; payflag?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard/requests");
  if (user.role === "admin") redirect("/admin/requests");

  const { id } = await params;
  const flags = await searchParams;
  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);
  const bundle = await getClientRequest(id, clientRow.id);
  if (!bundle) notFound();

  const { request: req, events, documents, invoice: inv } = bundle;
  const required = (req.requiredDocuments as RequiredDocument[]) ?? [];
  const clientUploads = documents.filter((d) => d.kind === "client_upload");
  const deliverables = documents.filter((d) => d.kind === "deliverable");
  const canUpload = ["awaiting_documents", "in_progress", "in_review"].includes(req.status);
  const issuer = await getIssuer();
  const hasBank = issuer.bank.accountNumber && issuer.bank.accountNumber !== "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-hairline pb-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <Link
            href="/dashboard/requests"
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            My Services
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {req.serviceName}
            </h1>
            {req.status === "awaiting_documents" && clientUploads.length > 0 ? (
              // The client has uploaded — acknowledge it rather than leaving them
              // staring at "Awaiting documents" as if nothing happened.
              <Badge tone="success">Documents provided</Badge>
            ) : (
              <Badge tone={requestStatusTone(req.status)}>
                {STATUS_LABELS[req.status as RequestStatus] ?? req.status}
              </Badge>
            )}
            <Badge tone="neutral">{req.number}</Badge>
          </div>
        </div>
        <RequestActions
          requestId={req.id}
          requestNumber={req.number}
          status={req.status}
          pricingMode={req.pricingMode}
        />
      </div>

      {/* Payment result banners */}
      {flags.paid && (
        <div className="flex items-center gap-3 rounded-card border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
          <CheckCircle2 className="size-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-ink">Payment confirmed — thank you!</p>
            <p className="text-xs text-body">
              Your receipt is on its way to your inbox.{" "}
              {required.length > 0 ? "Next: upload your documents below so we can get started." : "We're on it."}
            </p>
          </div>
        </div>
      )}
      {flags.payfail && req.status === "pending_payment" && (
        <div className="flex items-center gap-3 rounded-card border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-body">
            Your payment didn&apos;t complete — no money left your account. Use{" "}
            <span className="font-semibold text-ink">Complete payment</span> above to try again.
          </p>
        </div>
      )}
      {flags.payflag && (
        <div className="flex items-center gap-3 rounded-card border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-body">
            We received your payment but it needs a quick manual check — we&apos;ll confirm by email
            shortly. Nothing more to do.
          </p>
        </div>
      )}

      {/* Milestone tracker */}
      <RequestProgressTracker
        status={req.status}
        stepLabels={req.stepLabels as StepLabelOverrides}
        timestamps={milestoneTimes(events, req.createdAt)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Quote-path explainer */}
          {req.status === "quote_requested" && (
            <div className="rounded-card border border-hairline bg-paper p-5">
              <h3 className="font-display text-sm font-bold text-ink">What happens next?</h3>
              <p className="mt-2 text-sm text-body">
                Our team is reviewing your brief. You&apos;ll receive a tailored quote by email within{" "}
                <strong>2 business days</strong> — you can pay it right here once it lands.
              </p>
            </div>
          )}

          {deliverables.length > 0 && (
            <DeliverablesCard requestId={req.id} deliverables={deliverables} />
          )}

          {(canUpload || clientUploads.length > 0) && (
            <DocsChecklist
              requestId={req.id}
              required={required}
              documents={clientUploads}
              canUpload={canUpload}
            />
          )}

          {!["cancelled", "declined", "refunded", "completed"].includes(req.status) && (
            <RequestMessageBox requestId={req.id} />
          )}

          <RequestTimeline events={events} />
        </div>

        {/* Sidebar: brief + billing */}
        <div className="space-y-6">
          <div className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-3 font-display text-sm font-bold text-ink">Request summary</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3 border-b border-hairline pb-2.5">
                <dt className="text-muted">Reference</dt>
                <dd className="font-semibold text-ink">{req.number}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-hairline pb-2.5">
                <dt className="text-muted">Submitted</dt>
                <dd className="font-semibold text-ink">{formatDate(req.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-hairline pb-2.5">
                <dt className="text-muted">Pricing</dt>
                <dd className="font-semibold text-ink">
                  {req.priceSnapshot
                    ? formatMoney(num(req.priceSnapshot), req.currency)
                    : "Get A Quote"}
                </dd>
              </div>
              {req.details && (
                <div className="pt-1">
                  <dt className="mb-1 text-muted">Your brief</dt>
                  <dd className="rounded-xl border border-hairline bg-surface p-3 text-xs leading-relaxed text-body">
                    {req.details}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {inv && (
            <div className="rounded-card border border-hairline bg-paper p-5">
              <div className="mb-3 flex items-center gap-2">
                <ReceiptText className="size-4.5 text-brand" />
                <h3 className="font-display text-sm font-bold text-ink">Billing</h3>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-muted">{inv.number}</p>
                  <p className="font-display text-lg font-bold text-ink">
                    {formatMoney(num(inv.total), inv.currency)}
                  </p>
                </div>
                <Badge tone={inv.status === "paid" ? "success" : "warning"}>{inv.status}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/dashboard/invoices/${inv.id}`}
                  className="rounded-full border border-hairline bg-paper px-4 py-2 text-xs font-semibold text-body transition-colors hover:bg-surface"
                >
                  View invoice
                </Link>
                {inv.status === "paid" && (
                  <a
                    href={`/api/dashboard/invoices/${inv.id}/pdf?variant=receipt`}
                    className="rounded-full border border-hairline bg-paper px-4 py-2 text-xs font-semibold text-emerald-600 transition-colors hover:bg-surface dark:text-emerald-400"
                  >
                    Download receipt
                  </a>
                )}
              </div>
              {req.status === "pending_payment" && ["sent", "overdue"].includes(inv.status) && (
                <div className="mt-4 space-y-3 border-t border-hairline pt-4">
                  <PayButton token={inv.publicToken} label="Pay now" />
                  {hasBank && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-hairline bg-surface p-3 text-xs">
                      <Landmark className="mt-0.5 size-4 shrink-0 text-brand" />
                      <p className="text-body">
                        Prefer a transfer? {issuer.bank.name} ·{" "}
                        <span className="font-mono font-semibold text-ink">
                          {issuer.bank.accountNumber}
                        </span>{" "}
                        ({issuer.bank.accountName}). Use{" "}
                        <span className="font-medium">{inv.number}</span> as reference.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

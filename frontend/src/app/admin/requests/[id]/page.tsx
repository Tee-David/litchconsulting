import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ReceiptText, Download, UserRound } from "lucide-react";
import { getRequest } from "@/lib/db/queries/requests";
import { getClient } from "@/lib/db/queries/clients";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";
import {
  requestStatusTone,
  STATUS_LABELS,
  type RequestStatus,
  type StepLabelOverrides,
} from "@/lib/requests/status";
import { RequestProgressTracker } from "@/components/requests/progress-tracker";
import { RequestTimeline } from "@/components/requests/request-timeline";
import { formatMoney, num } from "@/lib/invoice/money";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { AdminRequestPanel } from "./admin-request-panel";
import { AdminDocumentList } from "./admin-document-list";
import { AiAnalysisCard } from "./ai-analysis-card";
import type { ServiceRequestEvent } from "@/lib/db/schema";
import type { RequiredDocument } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";

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
      (e) =>
        e.type === "deliverable_uploaded" ||
        (e.type === "status_changed" && e.toStatus === "delivered")
    ),
  };
}

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getRequest(id);
  if (!bundle) notFound();

  const { request: req, events, documents, invoice: inv, payments } = bundle;
  const clientRow = await getClient(req.clientId);
  const required = (req.requiredDocuments as RequiredDocument[]) ?? [];
  const clientUploads = documents.filter((d) => d.kind === "client_upload");
  const deliverables = documents.filter((d) => d.kind === "deliverable");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-hairline pb-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <Link
            href="/admin/requests"
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" /> Requests
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {req.serviceName}
            </h1>
            <Badge tone={requestStatusTone(req.status)}>
              {STATUS_LABELS[req.status as RequestStatus] ?? req.status}
            </Badge>
            <Badge tone="neutral">{req.number}</Badge>
            {req.assignee && <Badge tone="info">{req.assignee}</Badge>}
          </div>
        </div>
        {!inv && req.pricingMode === "quote" && req.status === "quote_requested" && (
          <Link
            href={`/admin/finance/invoices/new?requestId=${req.id}`}
            className="inline-flex items-center gap-2 self-start rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover keep-brand"
          >
            <ReceiptText className="size-4" /> Create quote invoice
          </Link>
        )}
      </div>

      <RequestProgressTracker
        status={req.status}
        stepLabels={req.stepLabels as StepLabelOverrides}
        timestamps={milestoneTimes(events, req.createdAt)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Client + brief */}
          <div className="rounded-card border border-hairline bg-paper p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-brand-tint text-brand">
                  <UserRound className="size-5" />
                </span>
                <div>
                  <Link
                    href={`/admin/clients/${req.clientId}`}
                    className="font-display text-sm font-bold text-ink hover:text-brand"
                  >
                    {clientRow?.company || clientRow?.name || "Unknown client"}
                  </Link>
                  <p className="text-xs text-muted">
                    {clientRow?.email || "no email"} · Submitted {formatDate(req.createdAt)}
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold tabular-nums text-ink">
                {req.priceSnapshot ? formatMoney(num(req.priceSnapshot), req.currency) : "Quote"}
              </span>
            </div>
            {req.details && (
              <div className="mt-4 rounded-xl border border-hairline bg-surface p-4 text-sm leading-relaxed text-body">
                {req.details}
              </div>
            )}
            {req.intake ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(req.intake as Record<string, string>).map(([k, v]) =>
                  v ? (
                    <span
                      key={k}
                      className="rounded-full border border-hairline px-3 py-1 text-xs text-body"
                    >
                      {k === "companySize" ? "Team" : k === "timeline" ? "Timeline" : k}: {v}
                    </span>
                  ) : null
                )}
              </div>
            ) : null}
          </div>

          {/* Documents */}
          <AdminDocumentList
            requestId={req.id}
            required={required}
            clientUploads={clientUploads}
            deliverables={deliverables}
          />

          {/* LitchAI bridge — relay, status, review, verified publish */}
          {process.env.LITCHAI_API_URL && clientUploads.length > 0 && (
            <AiAnalysisCard
              requestId={req.id}
              documents={clientUploads.map((d) => ({
                id: d.id,
                fileName: d.fileName,
                litchaiDocumentId: d.litchaiDocumentId,
                litchaiStatus: d.litchaiStatus,
              }))}
            />
          )}

          <RequestTimeline events={events} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <AdminRequestPanel
            requestId={req.id}
            status={req.status}
            assignee={req.assignee}
            hasInvoice={Boolean(inv)}
          />

          {/* Billing */}
          {inv && (
            <div className="rounded-card border border-hairline bg-paper p-5">
              <div className="mb-3 flex items-center gap-2">
                <ReceiptText className="size-4.5 text-brand" />
                <h3 className="font-display text-sm font-bold text-ink">Billing</h3>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <Link
                    href={`/admin/finance/invoices/${inv.id}`}
                    className="text-muted hover:text-brand"
                  >
                    {inv.number}
                  </Link>
                  <p className="font-display text-lg font-bold text-ink">
                    {formatMoney(num(inv.total), inv.currency)}
                  </p>
                </div>
                <Badge tone={invoiceStatusTone(inv.status)}>{inv.status}</Badge>
              </div>
              {payments.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-hairline pt-3">
                  {payments.slice(0, 4).map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="truncate font-mono text-muted">{p.reference}</span>
                      <span
                        className={
                          p.status === "success"
                            ? "font-semibold text-emerald-600 dark:text-emerald-400"
                            : p.status.startsWith("flagged") || p.status === "duplicate_success"
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : "text-muted"
                        }
                      >
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Deliverables quick list */}
          {deliverables.length > 0 && (
            <div className="rounded-card border border-hairline bg-paper p-5">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="size-4.5 text-brand" />
                <h3 className="font-display text-sm font-bold text-ink">Delivered files</h3>
              </div>
              <ul className="space-y-2">
                {deliverables.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-body">{d.fileName}</span>
                    <span className="flex items-center gap-2">
                      {d.publishVariant === "manual_override" && (
                        <Badge tone="warning">unverified</Badge>
                      )}
                      <span className="text-xs text-muted">{formatDateTime(d.createdAt)}</span>
                      <Download className="size-3.5 text-muted" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

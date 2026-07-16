import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calendar, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { getClientInvoice } from "@/lib/db/queries/invoices";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { toInvoiceData } from "@/lib/invoice/map";
import { InvoicePreview } from "@/components/admin/invoice/invoice-preview";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";
import { InvoiceDetailClient } from "./invoice-detail-client";

export const dynamic = "force-dynamic";

export default async function ClientInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard/invoices");
  if (user.role === "admin") redirect("/admin");

  const { id } = await params;

  // Retrieve client record to enforce authorization
  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);
  const data = await getClientInvoice(id, clientRow.id);

  if (!data) notFound();

  const issuer = await getIssuer();
  const invoiceData = toInvoiceData(data.invoice, data.items);

  const { status, kind, number, issueDate, dueDate, publicToken } = data.invoice;

  // Status timeline data
  const isQuote = kind === "quote";
  const steps = isQuote
    ? [
        { label: "Created", done: true },
        { label: "Sent", done: status === "sent" || status === "accepted" || status === "declined" },
        {
          label: status === "accepted" ? "Accepted" : status === "declined" ? "Declined" : "Response Pending",
          done: status === "accepted" || status === "declined",
          error: status === "declined",
        },
      ]
    : [
        { label: "Created", done: true },
        { label: "Sent", done: status === "sent" || status === "paid" || status === "overdue" },
        { label: "Paid", done: status === "paid", error: status === "overdue" && "Overdue" },
      ];

  return (
    <div className="space-y-6">
      {/* Top Navigation & Action Panel */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-hairline pb-5">
        <div className="space-y-1.5">
          <Link
            href="/dashboard/invoices"
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="size-4" />
            Back to Billing
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {number}
            </h1>
            <Badge tone={invoiceStatusTone(status)}>{status}</Badge>
            <Badge tone="neutral">{kind}</Badge>
          </div>
        </div>

        <InvoiceDetailClient
          invoiceId={id}
          kind={kind as "invoice" | "quote"}
          status={status}
          publicToken={publicToken}
          invoiceNumber={number}
        />
      </div>

      {/* Progress Timeline Tracker */}
      <div className="rounded-card border border-hairline bg-paper p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">
          Document Status Timeline
        </h3>
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          {/* Progress bar background */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-hairline sm:left-0 sm:right-0 sm:top-1/2 sm:h-0.5 sm:w-auto sm:-translate-y-1/2 -z-10" />

          {steps.map((step, idx) => {
            const isError = typeof step.error === "string" || step.error === true;
            return (
              <div
                key={step.label}
                className="flex items-center gap-3 sm:flex-col sm:gap-2 sm:text-center sm:flex-1 relative"
              >
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                    step.done
                      ? isError
                        ? "border-red-500 bg-red-50 text-red-600 dark:bg-red-950/20"
                        : "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20"
                      : "border-hairline bg-paper text-muted"
                  }`}
                >
                  {step.done ? (
                    isError ? (
                      <AlertCircle className="size-4.5" />
                    ) : (
                      <CheckCircle2 className="size-4.5" />
                    )
                  ) : (
                    <span className="text-xs font-bold">{idx + 1}</span>
                  )}
                </div>
                <div className="sm:space-y-0.5">
                  <p
                    className={`text-sm font-semibold ${
                      step.done ? "text-ink" : "text-muted"
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.error && typeof step.error === "string" && (
                    <p className="text-xs font-medium text-red-500">{step.error}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Billing Card Preview */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Branded Preview */}
        <div className="lg:col-span-2">
          <InvoicePreview data={invoiceData} issuer={issuer} />
        </div>

        {/* Right 1 Col: Metadata & Info */}
        <div className="space-y-6">
          <div className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-4 font-display text-sm font-bold text-ink">Summary Details</h3>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center pb-2.5 border-b border-hairline">
                <span className="text-muted">Issue Date</span>
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <Calendar className="size-4 text-muted" />
                  {issueDate}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-hairline">
                <span className="text-muted">Due/Expiry Date</span>
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <Calendar className="size-4 text-muted" />
                  {dueDate || "Upon Receipt"}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-hairline">
                <span className="text-muted">Project Reference</span>
                <span className="font-semibold text-ink truncate max-w-[150px]">
                  {data.invoice.projectTitle || "—"}
                </span>
              </div>
              {data.invoice.notes && (
                <div className="pt-2">
                  <span className="text-muted block mb-1">Notes / Instructions</span>
                  <p className="text-xs text-body leading-relaxed bg-surface rounded-xl p-3 border border-hairline">
                    {data.invoice.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

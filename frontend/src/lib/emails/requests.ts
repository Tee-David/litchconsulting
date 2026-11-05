import "server-only";
import type { ServiceRequest } from "@/lib/db/schema";
import { sendTemplate } from "@/lib/email-templates";
import { notifyAdmin } from "@/lib/notify";
import { STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";

/**
 * Service-request lifecycle emails (R6.1): every client-facing one renders
 * through lib/email-templates.ts (one layout, escaped merge fields, a "why
 * you got this" line). All best-effort: they never block the action. Admin
 * alerts go through notifyAdmin.
 */

function baseUrl() {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://litchconsulting.com"
  ).replace(/\/$/, "");
}

/** Client-typed text goes into admin alert HTML: escape it. */
const esc = (v: string | null | undefined) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function requestLink(req: ServiceRequest) {
  return `${baseUrl()}/dashboard/requests/${req.id}`;
}

async function safeSend(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error("[emails/requests] send failed:", err);
  }
}

/** Client ack on submit — copy differs for quote vs fixed-price paths. */
export async function emailRequestSubmitted(req: ServiceRequest, to: string, name?: string | null) {
  await safeSend(() =>
    sendTemplate(
      "requestReceived",
      { name, serviceName: req.serviceName, requestNumber: req.number, mode: req.pricingMode === "quote" ? "quote" : "pay", url: requestLink(req) },
      { to, dedupeKey: `request-received:${req.id}` },
    ),
  );
}

/** Admin alert on any new request. */
export async function alertAdminNewRequest(req: ServiceRequest, clientName?: string | null) {
  await notifyAdmin({
    subject: `New service request ${req.number} — ${req.serviceName}`,
    html: `<p><strong>${esc(clientName || "A client")}</strong> requested <strong>${req.serviceName}</strong> (${req.pricingMode === "quote" ? "quote-based" : `fixed — ₦${req.priceSnapshot ?? "?"}`}).</p><p style="color:#5b6474;">${esc((req.details || "No brief provided.").slice(0, 600))}</p>`,
    href: `${baseUrl()}/admin/requests/${req.id}`,
  });
}

/** Client notice when the admin moves the request to a new status. */
export async function emailStatusChanged(
  req: ServiceRequest,
  to: string,
  toStatus: RequestStatus,
  note?: string | null
) {
  const statusLabel = STATUS_LABELS[toStatus] ?? toStatus;
  await safeSend(() =>
    sendTemplate("requestUpdate", { serviceName: req.serviceName, requestNumber: req.number, statusLabel, note: note || null, url: requestLink(req) }, { to }),
  );
}

/** Client notice when a deliverable is ready to download. */
export async function emailDeliverableReady(req: ServiceRequest, to: string, fileName: string) {
  await safeSend(() =>
    sendTemplate("deliverableReady", { serviceName: req.serviceName, requestNumber: req.number, fileName, url: requestLink(req) }, { to, dedupeKey: `deliverable:${req.id}:${fileName}` }),
  );
}

/** Terminal outcomes: cancelled / declined / refunded. */
export async function emailRequestTerminal(
  req: ServiceRequest,
  to: string,
  status: "cancelled" | "declined" | "refunded",
  reason?: string | null
) {
  await safeSend(() =>
    sendTemplate(
      "requestClosed",
      { serviceName: req.serviceName, requestNumber: req.number, outcome: status, reason: reason || null, url: `${baseUrl()}/dashboard/support?new=true` },
      { to, dedupeKey: `request-closed:${req.id}:${status}` },
    ),
  );
}

/** Admin alert when every required document slot is filled. */
export async function alertAdminDocumentsComplete(req: ServiceRequest) {
  await notifyAdmin({
    subject: `All documents in for ${req.number} — ${req.serviceName}`,
    html: `<p>Every required document for <strong>${req.number}</strong> has been uploaded. The request has moved to <strong>In progress</strong>.</p>`,
    href: `${baseUrl()}/admin/requests/${req.id}`,
  });
}

/** Admin alert on a single client upload. */
export async function alertAdminDocumentUploaded(req: ServiceRequest, fileName: string) {
  await notifyAdmin({
    subject: `Document uploaded on ${req.number}`,
    html: `<p><strong>${esc(fileName)}</strong> was uploaded on request <strong>${req.number}</strong> (${req.serviceName}).</p>`,
    href: `${baseUrl()}/admin/requests/${req.id}`,
  });
}

/** Client notice when the advisor returns a document for correction. */
export async function emailCorrectionRequested(
  req: ServiceRequest,
  to: string,
  fileName: string,
  reason: string
) {
  await safeSend(() =>
    sendTemplate(
      "actionNeeded",
      {
        requestNumber: req.number,
        what: `a corrected copy of ${fileName}`,
        why: reason,
        hint: "Open your request to upload the corrected file. It takes a minute.",
        url: requestLink(req),
      },
      { to },
    ),
  );
}

/** Admin alert when a client replies on the request thread. */
export async function alertAdminClientMessage(req: ServiceRequest, body: string, clientName?: string | null) {
  await notifyAdmin({
    subject: `New message on ${req.number} from ${clientName || "client"}`,
    html: `<p><strong>${esc(clientName || "The client")}</strong> replied on request <strong>${req.number}</strong> (${req.serviceName}):</p><p style="color:#3c4657;padding:12px 16px;background:#f3f5fb;border-radius:12px;">${esc(body)}</p>`,
    href: `${baseUrl()}/admin/requests/${req.id}`,
  });
}

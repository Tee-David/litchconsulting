import "server-only";
import type { ServiceRequest } from "@/lib/db/schema";
import { sendEmail, emailLayout } from "@/lib/email";
import { notifyAdmin } from "@/lib/notify";
import { STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";

/**
 * Service-request lifecycle emails. All best-effort (never block the action)
 * and all through the branded SMTP layout. Client-facing copy stays warm,
 * short, and always says what happens next.
 */

function baseUrl() {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://litchconsulting.com"
  ).replace(/\/$/, "");
}

function button(href: string, label: string) {
  return `<p style="margin:0 0 20px;"><a href="${href}" style="display:inline-block;background:#0a196d;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px;">${label}</a></p>`;
}

function requestLink(req: ServiceRequest) {
  return `${baseUrl()}/dashboard/requests/${req.id}`;
}

async function safeSend(opts: Parameters<typeof sendEmail>[0]) {
  try {
    await sendEmail(opts);
  } catch (err) {
    console.error("[emails/requests] send failed:", err);
  }
}

/** Client ack on submit — copy differs for quote vs fixed-price paths. */
export async function emailRequestSubmitted(req: ServiceRequest, to: string, name?: string | null) {
  const isQuote = req.pricingMode === "quote";
  await safeSend({
    to,
    subject: isQuote
      ? `We received your request — ${req.number}`
      : `Complete your payment — ${req.number}`,
    html: emailLayout(`
      <p style="margin:0 0 14px;">Hi ${name || "there"},</p>
      <p style="margin:0 0 18px;">Thanks for requesting <strong>${req.serviceName}</strong>. Your reference is <strong>${req.number}</strong>.</p>
      ${
        isQuote
          ? `<p style="margin:0 0 18px;">We'll review the details you shared and send you a tailored quote within <strong>2 business days</strong>. You'll get an email the moment it's ready, and you can track everything from your dashboard.</p>`
          : `<p style="margin:0 0 18px;">One step left: complete your payment to get things moving. Your request stays reserved in your dashboard if you need to come back to it.</p>`
      }
      ${button(requestLink(req), isQuote ? "Track your request" : "Complete payment")}
    `),
  });
}

/** Admin alert on any new request. */
export async function alertAdminNewRequest(req: ServiceRequest, clientName?: string | null) {
  await notifyAdmin({
    subject: `New service request ${req.number} — ${req.serviceName}`,
    html: `<p><strong>${clientName || "A client"}</strong> requested <strong>${req.serviceName}</strong> (${req.pricingMode === "quote" ? "quote-based" : `fixed — ₦${req.priceSnapshot ?? "?"}`}).</p><p style="color:#5b6474;">${(req.details || "No brief provided.").slice(0, 600)}</p>`,
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
  const label = STATUS_LABELS[toStatus] ?? toStatus;
  await safeSend({
    to,
    subject: `${req.number} update — ${label}`,
    html: emailLayout(`
      <p style="margin:0 0 14px;">Hi there,</p>
      <p style="margin:0 0 18px;">Your <strong>${req.serviceName}</strong> request (${req.number}) is now <strong>${label}</strong>.</p>
      ${note ? `<p style="margin:0 0 18px;padding:12px 16px;background:#f3f5fb;border-radius:12px;color:#3c4657;">${note}</p>` : ""}
      ${button(requestLink(req), "View progress")}
    `),
  });
}

/** Client notice when a deliverable is ready to download. */
export async function emailDeliverableReady(req: ServiceRequest, to: string, fileName: string) {
  await safeSend({
    to,
    subject: `Your ${req.serviceName} deliverable is ready — ${req.number}`,
    html: emailLayout(`
      <p style="margin:0 0 14px;">Hi there,</p>
      <p style="margin:0 0 18px;">Good news — <strong>${fileName}</strong> is ready for you. Sign in to review and download it from your request workspace.</p>
      ${button(requestLink(req), "Download your deliverable")}
      <p style="margin:0;color:#5b6474;font-size:13px;">If anything looks off, reply in the workspace or open a support ticket — we're on it.</p>
    `),
  });
}

/** Terminal outcomes: cancelled / declined / refunded. */
export async function emailRequestTerminal(
  req: ServiceRequest,
  to: string,
  status: "cancelled" | "declined" | "refunded",
  reason?: string | null
) {
  const titles = {
    cancelled: `Request ${req.number} cancelled`,
    declined: `Update on your request ${req.number}`,
    refunded: `Refund confirmed for ${req.number}`,
  } as const;
  await safeSend({
    to,
    subject: titles[status],
    html: emailLayout(`
      <p style="margin:0 0 14px;">Hi there,</p>
      <p style="margin:0 0 18px;">Your <strong>${req.serviceName}</strong> request (${req.number}) has been <strong>${STATUS_LABELS[status].toLowerCase()}</strong>.</p>
      ${reason ? `<p style="margin:0 0 18px;padding:12px 16px;background:#f3f5fb;border-radius:12px;color:#3c4657;">${reason}</p>` : ""}
      <p style="margin:0 0 18px;">If you'd like to talk it through or start again, we're one message away.</p>
      ${button(`${baseUrl()}/dashboard/support?new=true`, "Contact support")}
    `),
  });
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
    html: `<p><strong>${fileName}</strong> was uploaded on request <strong>${req.number}</strong> (${req.serviceName}).</p>`,
    href: `${baseUrl()}/admin/requests/${req.id}`,
  });
}

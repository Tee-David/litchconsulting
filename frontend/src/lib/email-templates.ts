import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { site } from "@/lib/content";
import { siteOrigin } from "@/lib/site-url";
import { sendEmail, type MailAttachment } from "@/lib/email";
import type { NotifyCategory } from "@/lib/notifications";

/**
 * THE EMAIL TEMPLATE REGISTRY (R6.1).
 *
 * Every lifecycle email is one entry here: who it is for (`audience`), which
 * notification category it belongs to (so the footer links to the matching
 * setting), whether it always sends (security and payment mail cannot be
 * switched off), its merge tags, and a builder that returns the content. One
 * shell renders them all: brand header, one heading, body, an optional summary
 * box, one button with a copyable link, and a footer that says WHY the email
 * was sent.
 *
 * Use it:
 *   // send directly (auth mail, invitations):
 *   await sendTemplate("invitation", { ...data }, { to, dedupeKey, recipientUserId });
 *   // or hand the rendered mail to notifyUsers (bell + email + push):
 *   await notifyUsers({ ..., email: templateEmail("quoteReady", data) });
 *
 * Builders receive merge data and return PLAIN text fields; everything is
 * HTML-escaped here, so a client's company name can never inject markup.
 * Paragraphs may use **bold** (the only markup allowed).
 */

/* ------------------------------------------------------------------ tokens
   Email HTML is its own world: tables, inline styles, 600px. These are the
   brand values (fixed hex is correct inside an email). */
const C = {
  navy: "#0a196d",
  brand: "#2540c4",
  ink: "#0a0e1a",
  body: "#41485a",
  muted: "#6b7386",
  hair: "#e6e8f0",
  tint: "#eef1fb",
  page: "#f4f6fb",
  card: "#ffffff",
};
const FONT = "'Outfit','Segoe UI',Arial,Helvetica,sans-serif";
const DISPLAY = "'Space Grotesk','Segoe UI',Arial,Helvetica,sans-serif";

export type EmailAudience = "client" | "staff" | "admin" | "anyone";

export type EmailBody = {
  subject: string;
  /** Inbox preview line. */
  preheader: string;
  heading: string;
  /** "Hello Emeka," — first name only; omitted when unknown. */
  greeting?: string | null;
  paragraphs: string[];
  /** Summary box: label/value rows (figures, dates, references). */
  rows?: Array<{ label: string; value: string; strong?: boolean }>;
  cta?: { label: string; href: string };
  /** Small print under the button (expiry, "ignore if not you"). */
  note?: string;
  /** "You got this because…" — required, specific to this send. */
  why: string;
  /** Display name for the From header, e.g. "Hauwa at Litch Consulting". */
  fromName?: string;
};

type Def<D> = {
  audience: EmailAudience;
  /** Notification category this belongs to; null = account/security mail. */
  category: NotifyCategory | null;
  /** True for security and payment mail that cannot be switched off. */
  always: boolean;
  /** Documentation: the merge tags the builder reads. */
  mergeTags: Array<keyof D & string>;
  build: (d: D) => EmailBody;
};

const first = (name?: string | null) => (name || "").trim().split(/\s+/)[0] || null;
const fmtDate = (d: Date | string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date(d));

/* ------------------------------------------------------------- templates */

export type InvitationData = {
  inviterName: string;
  role: "admin" | "staff" | "client";
  email: string;
  url: string;
  expiresAt: Date | string;
  company?: string | null;
  access?: string | null;
  message?: string | null;
};
export type VerifyData = { name?: string | null; url: string; serviceName?: string | null };
export type ResetData = { name?: string | null; url: string };
export type WelcomeData = { name?: string | null; role: "admin" | "staff" | "client"; homeUrl: string };
export type SecurityNoticeData = { name?: string | null; what: string; when: Date | string; device?: string | null };
export type InviteAcceptedData = { adminName?: string | null; personName: string; personEmail: string; role: "admin" | "staff" | "client"; company?: string | null };
export type QuoteReadyData = { name?: string | null; senderName?: string | null; serviceName: string; quoteNumber: string; total: string; deposit?: string | null; validTo?: string | null; summary?: string | null; requestDate?: string | null; url: string };
export type ActionNeededData = { name?: string | null; senderName?: string | null; requestNumber: string; what: string; why?: string | null; hint?: string | null; due?: string | null; url: string };
export type DraftData = { name?: string | null; senderName?: string | null; requestNumber: string; serviceName: string; version: number; round: number; rounds: number; changes?: string | null; answerBy?: string | null; figure?: { label: string; value: string } | null; url: string };
export type ReceiptData = { name?: string | null; receiptNumber: string; forWhat: string; rows: Array<{ label: string; value: string; strong?: boolean }>; total: string; url: string };
export type DigestData = { name?: string | null; dateLabel: string; needsYou: string[]; updates: string[]; url: string; categoryLabel: string };
export type RequestReceivedData = { name?: string | null; serviceName: string; requestNumber: string; mode: "quote" | "pay"; url: string };
export type RequestUpdateData = { name?: string | null; serviceName: string; requestNumber: string; statusLabel: string; note?: string | null; url: string };
export type DeliverableData = { name?: string | null; serviceName: string; requestNumber: string; fileName: string; url: string };
export type RequestClosedData = { name?: string | null; serviceName: string; requestNumber: string; outcome: "cancelled" | "declined" | "refunded"; reason?: string | null; url: string };
export type InvoiceSentData = { name?: string | null; invoiceNumber: string; projectTitle?: string | null; total: string; due?: string | null; url: string };
/**
 * General-purpose notice for one-off sends (reminders, follow-ups, support
 * replies, admin alerts). Every string is escaped by the renderer; use **bold**
 * for emphasis and 
 for line breaks. Never pass HTML.
 */
export type NoticeData = {
  subject: string;
  preheader?: string | null;
  heading: string;
  name?: string | null;
  paragraphs: string[];
  rows?: Array<{ label: string; value: string; strong?: boolean }>;
  cta?: { label: string; href: string } | null;
  note?: string | null;
  why: string;
  fromName?: string | null;
};
export type AssignedData = { name?: string | null; assignerName: string; requests: Array<{ number: string; service: string; client?: string | null }>; url: string };

const ACCESS_TEXT: Record<string, string> = {
  billing: "a billing contact (invoices, receipts and payments)",
  reviewer: "a reviewer (can approve drafts)",
  viewer: "a viewer (can see requests and files)",
};

export const EMAIL_TEMPLATES = {
  invitation: {
    audience: "anyone",
    category: null,
    always: true,
    mergeTags: ["inviterName", "role", "email", "url", "expiresAt", "company", "access", "message"],
    build: (d: InvitationData): EmailBody => ({
      subject: d.role !== "client" ? `${first(d.inviterName)} invited you to Litch Consulting` : `${first(d.inviterName)} invited you to ${d.company || "your company"} on Litch`,
      preheader: "Set up your account. The link works once, for 7 days.",
      heading: d.role !== "client" ? `You are invited to join Litch as ${d.role === "admin" ? "an Admin" : "Staff"}` : `You are invited to ${d.company || "your company"} on Litch`,
      paragraphs: [
        d.role === "admin"
          ? `${d.inviterName} added you to the Litch Consulting team as an Admin. You will run billing, settings, the team and every request.`
          : d.role === "staff"
          ? `${d.inviterName} added you to the Litch Consulting team. You will work on the requests assigned to you, with the client's files and Sage beside you.`
          : `${d.inviterName} added you to **${d.company || "their company"}** on Litch Consulting as ${ACCESS_TEXT[d.access || "viewer"] || "a colleague"}.`,
        ...(d.message ? [`“${d.message}”`] : []),
      ],
      rows: [
        { label: "Your role", value: d.role === "admin" ? "Admin" : d.role === "staff" ? "Staff" : d.access ? d.access[0].toUpperCase() + d.access.slice(1) : "Client contact" },
        { label: "Sign in with", value: d.email },
        { label: "Link expires", value: fmtDate(d.expiresAt) },
      ],
      cta: { label: "Accept the invitation", href: d.url },
      note: "The link works once. Sending a new invitation replaces it.",
      why: `You got this because ${d.inviterName} invited this address to Litch Consulting. If you did not expect it, ignore it; nothing is created until you accept.`,
    }),
  } satisfies Def<InvitationData>,

  verifyEmail: {
    audience: "anyone",
    category: null,
    always: true,
    mergeTags: ["name", "url", "serviceName"],
    build: (d: VerifyData): EmailBody => ({
      subject: "Confirm your email for Litch",
      preheader: d.serviceName ? "One click and your request continues." : "One click to activate your account.",
      heading: "Confirm your email",
      greeting: first(d.name),
      paragraphs: [
        d.serviceName
          ? `Press the button to confirm this address. Your request for **${d.serviceName}** is saved and waits for you, on any device.`
          : "Press the button to confirm this address and open your client portal: request services, track progress, pay invoices and download your files.",
      ],
      cta: { label: "Confirm my email", href: d.url },
      note: "The link works for 1 hour. If it has expired, sign in and we will send a fresh one.",
      why: "You got this because someone created a Litch account with this address. If it was not you, ignore this email and no account is activated.",
    }),
  } satisfies Def<VerifyData>,

  passwordReset: {
    audience: "anyone",
    category: null,
    always: true,
    mergeTags: ["name", "url"],
    build: (d: ResetData): EmailBody => ({
      subject: "Reset your Litch password",
      preheader: "The link works once, for 1 hour.",
      heading: "Choose a new password",
      greeting: first(d.name),
      paragraphs: ["Someone asked to reset the password for this Litch account. If it was you, choose a new one below."],
      cta: { label: "Choose a new password", href: d.url },
      note: "The link works once, for 1 hour. If you did not ask for this, ignore this email; your password stays the same.",
      why: "You got this because a password reset was requested for this address. Security emails always send.",
    }),
  } satisfies Def<ResetData>,

  welcome: {
    audience: "anyone",
    category: null,
    always: true,
    mergeTags: ["name", "role", "homeUrl"],
    build: (d: WelcomeData): EmailBody => ({
      subject: d.role === "client" ? "Welcome to Litch Consulting" : "Welcome to the Litch team",
      preheader: d.role === "client" ? "Your portal is ready." : "Your work is waiting.",
      heading: d.role === "client" ? "Your account is ready" : "Welcome to the team",
      greeting: first(d.name),
      paragraphs:
        d.role === "client"
          ? ["From your dashboard you can request a service, track each step, pay invoices, review drafts and download your files.", "Questions? Reply to this email; a person reads it."]
          : d.role === "staff"
            ? ["You will see the requests assigned to you, their files and the client's messages. Two-step sign-in protects your account, so keep your authenticator app handy."]
            : ["You have full access: requests, clients, billing, settings and the team. Two-step sign-in protects your account."],
      cta: { label: d.role === "client" ? "Open my dashboard" : "Open my work", href: d.homeUrl },
      why: "You got this because your Litch account was just activated.",
    }),
  } satisfies Def<WelcomeData>,

  securityNotice: {
    audience: "anyone",
    category: null,
    always: true,
    mergeTags: ["name", "what", "when", "device"],
    build: (d: SecurityNoticeData): EmailBody => ({
      subject: `Security notice: ${d.what}`,
      preheader: "If this was you, there is nothing to do.",
      heading: d.what,
      greeting: first(d.name),
      paragraphs: [
        `This happened on your Litch account on ${fmtDate(d.when)}${d.device ? ` (${d.device})` : ""}.`,
        "If this was you, there is nothing to do. If it was not, reset your password now and sign out every other device from Profile and security.",
      ],
      cta: { label: "Review my security", href: `${siteOrigin()}/account/security` },
      why: "You got this because something changed on your account's sign-in. Security emails always send.",
    }),
  } satisfies Def<SecurityNoticeData>,

  inviteAccepted: {
    audience: "admin",
    category: "team",
    always: false,
    mergeTags: ["adminName", "personName", "personEmail", "role", "company"],
    build: (d: InviteAcceptedData): EmailBody => ({
      subject: `${d.personName} accepted your invitation`,
      preheader: d.role === "staff" ? "Assign them a request to get started." : `They now have access to ${d.company || "their company"}.`,
      heading: `${d.personName} joined Litch`,
      greeting: first(d.adminName),
      paragraphs: [
        d.role === "staff"
          ? `${d.personName} (${d.personEmail}) accepted the invitation and is now Staff. They see nothing until you assign them a request.`
          : `${d.personName} (${d.personEmail}) accepted the invitation and joined ${d.company || "their company"}.`,
      ],
      cta: { label: d.role === "staff" ? "Assign a request" : "Open Team and access", href: `${siteOrigin()}/admin/settings/access${d.role === "staff" ? "?tab=assign" : ""}` },
      why: "You got this because you are an Admin and an invitation was accepted.",
    }),
  } satisfies Def<InviteAcceptedData>,

  quoteReady: {
    audience: "client",
    category: "billing",
    always: false,
    mergeTags: ["name", "senderName", "serviceName", "quoteNumber", "total", "deposit", "validTo", "summary", "requestDate", "url"],
    build: (d: QuoteReadyData): EmailBody => ({
      subject: `Your quote: ${d.serviceName}, ${d.total}`,
      preheader: d.deposit ? `Accept in one click. ${d.deposit} deposit to start.` : "Accept in one click.",
      heading: "Your quote is ready",
      greeting: first(d.name),
      paragraphs: [`Here is the quote for the ${d.serviceName} you asked for.${d.summary ? ` ${d.summary}` : ""}`],
      rows: [
        { label: "Quote", value: d.quoteNumber },
        { label: "Total incl. VAT", value: d.total, strong: true },
        ...(d.deposit ? [{ label: "Deposit to start", value: d.deposit }] : []),
        ...(d.validTo ? [{ label: "Valid to", value: d.validTo }] : []),
      ],
      cta: { label: "Review and accept", href: d.url },
      fromName: d.senderName ? `${first(d.senderName)} at Litch Consulting` : undefined,
      why: `You got this because you requested ${d.serviceName} on Litch${d.requestDate ? ` on ${d.requestDate}` : ""}. Billing emails are sent right away; change this in Notifications.`,
    }),
  } satisfies Def<QuoteReadyData>,

  actionNeeded: {
    audience: "client",
    category: "actions",
    always: false,
    mergeTags: ["name", "senderName", "requestNumber", "what", "why", "hint", "due", "url"],
    build: (d: ActionNeededData): EmailBody => ({
      subject: `${d.what}${d.due ? `, due ${d.due}` : ""}`,
      preheader: d.why || "One thing to keep your request moving.",
      heading: "We need something from you",
      greeting: first(d.name),
      paragraphs: [`To keep ${d.requestNumber} moving we need: **${d.what}**.${d.why ? ` ${d.why}` : ""}`, ...(d.hint ? [d.hint] : [])],
      rows: [{ label: "Request", value: d.requestNumber }, ...(d.due ? [{ label: "Due", value: d.due }] : [])],
      cta: { label: "Answer now", href: d.url },
      fromName: d.senderName ? `${first(d.senderName)} at Litch Consulting` : undefined,
      why: `You got this because ${d.senderName || "the team"} working on ${d.requestNumber} asked for it. Action emails have a due date, so we recommend keeping them on.`,
    }),
  } satisfies Def<ActionNeededData>,

  draftForReview: {
    audience: "client",
    category: "actions",
    always: false,
    mergeTags: ["name", "senderName", "requestNumber", "serviceName", "version", "round", "rounds", "changes", "answerBy", "figure", "url"],
    build: (d: DraftData): EmailBody => ({
      subject: `Draft v${d.version} is ready for your review (round ${d.round} of ${d.rounds})`,
      preheader: d.changes || "Approve it, or tell us what to change.",
      heading: "Your draft is ready to review",
      greeting: first(d.name),
      paragraphs: [
        `Draft v${d.version} of your ${d.serviceName} is ready.${d.changes ? ` ${d.changes}` : ""}`,
        d.round >= d.rounds ? `Approve it, or tell us what to change. This is the last included round.` : "Approve it, or tell us what to change.",
      ],
      rows: [
        ...(d.figure ? [{ label: d.figure.label, value: d.figure.value, strong: true }] : []),
        { label: "Round", value: `${d.round} of ${d.rounds}` },
        ...(d.answerBy ? [{ label: "Please answer by", value: d.answerBy }] : []),
      ],
      cta: { label: "Review the draft", href: d.url },
      fromName: d.senderName ? `${first(d.senderName)} at Litch Consulting` : undefined,
      why: `You got this because a draft on your request ${d.requestNumber} is waiting for your approval.`,
    }),
  } satisfies Def<DraftData>,

  receipt: {
    audience: "client",
    category: "billing",
    always: true,
    mergeTags: ["name", "receiptNumber", "forWhat", "rows", "total", "url"],
    build: (d: ReceiptData): EmailBody => ({
      subject: `Receipt ${d.receiptNumber} for ${d.total}`,
      preheader: `${d.forWhat}. Thank you.`,
      heading: "Payment received. Thank you",
      greeting: first(d.name),
      paragraphs: [`We received your payment for ${d.forWhat}. Your receipt is attached and is also in Billing.`],
      rows: d.rows,
      cta: { label: "View receipt", href: d.url },
      why: "You got this because a payment was recorded on your account. Receipts always send, for your records.",
    }),
  } satisfies Def<ReceiptData>,

  digest: {
    audience: "anyone",
    category: "progress",
    always: false,
    mergeTags: ["name", "dateLabel", "needsYou", "updates", "url", "categoryLabel"],
    build: (d: DigestData): EmailBody => ({
      subject: `Your Litch summary for ${d.dateLabel}`,
      preheader: `${d.needsYou.length} ${d.needsYou.length === 1 ? "thing needs" : "things need"} you, ${d.updates.length} ${d.updates.length === 1 ? "update" : "updates"}.`,
      heading: "Your summary",
      greeting: first(d.name),
      paragraphs: [
        ...(d.needsYou.length ? [`**Needs you (${d.needsYou.length})**\n${d.needsYou.join("\n")}`] : ["Nothing needs you right now."]),
        ...(d.updates.length ? [`**Updates (${d.updates.length})**\n${d.updates.join("\n")}`] : []),
      ],
      cta: { label: "Open my dashboard", href: d.url },
      why: `You got this because you chose a digest for ${d.categoryLabel}.`,
    }),
  } satisfies Def<DigestData>,

  requestReceived: {
    audience: "client",
    category: "progress",
    always: false,
    mergeTags: ["name", "serviceName", "requestNumber", "mode", "url"],
    build: (d: RequestReceivedData): EmailBody => ({
      subject: d.mode === "quote" ? `We received your request ${d.requestNumber}` : `Complete your payment for ${d.requestNumber}`,
      preheader: d.mode === "quote" ? "Your quote follows within 2 business days." : "One step left: payment.",
      heading: d.mode === "quote" ? "We received your request" : "One step left",
      greeting: first(d.name),
      paragraphs: [
        `Thanks for requesting **${d.serviceName}**. Your reference is **${d.requestNumber}**.`,
        d.mode === "quote"
          ? "We review what you shared and send a quote within 2 business days. You are never charged before you accept it."
          : "Complete your payment to start the work. The request stays in your dashboard if you need to come back to it.",
      ],
      rows: [
        { label: "Service", value: d.serviceName },
        { label: "Reference", value: d.requestNumber },
      ],
      cta: { label: d.mode === "quote" ? "Track your request" : "Complete payment", href: d.url },
      why: `You got this because you requested ${d.serviceName} on Litch.`,
    }),
  } satisfies Def<RequestReceivedData>,

  requestUpdate: {
    audience: "client",
    category: "progress",
    always: false,
    mergeTags: ["name", "serviceName", "requestNumber", "statusLabel", "note", "url"],
    build: (d: RequestUpdateData): EmailBody => ({
      subject: `${d.requestNumber}: ${d.statusLabel}`,
      preheader: d.note || `Your ${d.serviceName} request is now ${d.statusLabel.toLowerCase()}.`,
      heading: "An update on your request",
      greeting: first(d.name),
      paragraphs: [`Your **${d.serviceName}** request (${d.requestNumber}) is now **${d.statusLabel}**.`, ...(d.note ? [d.note] : [])],
      cta: { label: "View progress", href: d.url },
      why: `You got this because the status of your request ${d.requestNumber} changed.`,
    }),
  } satisfies Def<RequestUpdateData>,

  deliverableReady: {
    audience: "client",
    category: "progress",
    always: false,
    mergeTags: ["name", "serviceName", "requestNumber", "fileName", "url"],
    build: (d: DeliverableData): EmailBody => ({
      subject: `Your ${d.serviceName} is ready: ${d.requestNumber}`,
      preheader: `${d.fileName} is ready to download.`,
      heading: "Your work is ready",
      greeting: first(d.name),
      paragraphs: [`**${d.fileName}** is ready. Sign in to download it from your request.`, "If anything looks off, reply on the request and we pick it up."],
      rows: [
        { label: "Request", value: d.requestNumber },
        { label: "File", value: d.fileName },
      ],
      cta: { label: "Download", href: d.url },
      why: `You got this because we delivered work on your request ${d.requestNumber}.`,
    }),
  } satisfies Def<DeliverableData>,

  requestClosed: {
    audience: "client",
    category: "progress",
    always: true,
    mergeTags: ["name", "serviceName", "requestNumber", "outcome", "reason", "url"],
    build: (d: RequestClosedData): EmailBody => ({
      subject: d.outcome === "refunded" ? `Refund confirmed for ${d.requestNumber}` : d.outcome === "cancelled" ? `Request ${d.requestNumber} cancelled` : `An update on your request ${d.requestNumber}`,
      preheader: d.reason || `Your ${d.serviceName} request was ${d.outcome}.`,
      heading: d.outcome === "refunded" ? "Your refund is confirmed" : d.outcome === "cancelled" ? "Your request was cancelled" : "We cannot take this request on",
      greeting: first(d.name),
      paragraphs: [
        `Your **${d.serviceName}** request (${d.requestNumber}) was ${d.outcome}.`,
        ...(d.reason ? [d.reason] : []),
        "If you want to talk it through or start again, we are one message away.",
      ],
      cta: { label: "Contact support", href: d.url },
      why: `You got this because your request ${d.requestNumber} was closed. Closing notices always send.`,
    }),
  } satisfies Def<RequestClosedData>,

  invoiceSent: {
    audience: "client",
    category: "billing",
    always: true,
    mergeTags: ["name", "invoiceNumber", "projectTitle", "total", "due", "url"],
    build: (d: InvoiceSentData): EmailBody => ({
      subject: `Invoice ${d.invoiceNumber} from Litch Consulting`,
      preheader: `${d.total}${d.due ? ` due ${d.due}` : ""}. The PDF is attached.`,
      heading: `Invoice ${d.invoiceNumber}`,
      greeting: first(d.name),
      paragraphs: [`Your invoice${d.projectTitle ? ` for **${d.projectTitle}**` : ""} is attached. View it online or pay with the button below.`],
      rows: [
        { label: "Invoice", value: d.invoiceNumber },
        ...(d.projectTitle ? [{ label: "Project", value: d.projectTitle }] : []),
        ...(d.due ? [{ label: "Due", value: d.due }] : []),
        { label: "Amount due", value: d.total, strong: true },
      ],
      cta: { label: "View and pay", href: d.url },
      note: `Or open it here: ${d.url}`,
      why: "You got this because Litch Consulting issued you an invoice. Invoices always send, for your records.",
    }),
  } satisfies Def<InvoiceSentData>,

  notice: {
    audience: "anyone",
    category: null,
    always: true,
    mergeTags: ["subject", "preheader", "heading", "name", "paragraphs", "rows", "cta", "note", "why", "fromName"],
    build: (d: NoticeData): EmailBody => ({
      subject: d.subject,
      preheader: d.preheader || d.paragraphs[0]?.replace(/**/g, "").slice(0, 120) || d.heading,
      heading: d.heading,
      greeting: first(d.name),
      paragraphs: d.paragraphs,
      rows: d.rows,
      cta: d.cta ?? undefined,
      note: d.note ?? undefined,
      why: d.why,
      fromName: d.fromName ?? undefined,
    }),
  } satisfies Def<NoticeData>,

  assigned: {
    audience: "staff",
    category: "team",
    always: false,
    mergeTags: ["name", "assignerName", "requests", "url"],
    build: (d: AssignedData): EmailBody => ({
      subject: d.requests.length === 1 ? `You have been assigned ${d.requests[0].number}: ${d.requests[0].service}` : `You have been assigned ${d.requests.length} requests`,
      preheader: `${first(d.assignerName)} assigned you new work.`,
      heading: "New work assigned to you",
      greeting: first(d.name),
      paragraphs: [`${d.assignerName} assigned you:`, d.requests.map((r) => `**${r.number}** · ${r.service}${r.client ? ` · ${r.client}` : ""}`).join("\n")],
      cta: { label: "Open my work", href: d.url },
      why: "You got this because you were assigned to a client request at Litch Consulting.",
    }),
  } satisfies Def<AssignedData>,
} as const;

export type TemplateKey = keyof typeof EMAIL_TEMPLATES;
export type TemplateData<K extends TemplateKey> = Parameters<(typeof EMAIL_TEMPLATES)[K]["build"]>[0];

/* --------------------------------------------------------- unsubscribe */

function secret(): string {
  return process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "litch-dev-secret";
}

/** Signature for a one-click "stop this kind of email" link. */
export function unsubscribeSignature(userId: string, category: string): string {
  return createHmac("sha256", secret()).update(`unsub:${userId}:${category}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribe(userId: string, category: string, sig: string): boolean {
  const want = Buffer.from(unsubscribeSignature(userId, category));
  const got = Buffer.from(String(sig || ""));
  return want.length === got.length && timingSafeEqual(want, got);
}

export function unsubscribeUrl(userId: string, category: string): string {
  const q = new URLSearchParams({ u: userId, c: category, s: unsubscribeSignature(userId, category) });
  return `${siteOrigin()}/unsubscribe?${q.toString()}`;
}

/** Where each audience changes its notification settings. */
export function notificationSettingsHref(audience: EmailAudience): string {
  const base = siteOrigin();
  if (audience === "client") return `${base}/dashboard/notifications?tab=prefs`;
  if (audience === "staff") return `${base}/work/notifications?tab=prefs`;
  if (audience === "admin") return `${base}/admin/notifications#prefs`;
  return `${base}/account/security`;
}

/* --------------------------------------------------------------- render */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Escape, then allow **bold** and line breaks — the only markup builders may use. */
const rich = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong class="ink" style="color:#0a0e1a;">$1</strong>').replace(/\n/g, "<br>");
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");
const absolute = (href: string) => (/^https?:\/\//i.test(href) ? href : `${siteOrigin()}${href.startsWith("/") ? "" : "/"}${href}`);

export type RenderOptions = {
  /** The recipient's user id: enables the signed one-click unsubscribe link. */
  recipientUserId?: string | null;
  /** Override the template's audience (e.g. a digest to staff). */
  audience?: EmailAudience;
};

export type RenderedEmail = { subject: string; html: string; text: string; fromName?: string };

export function renderTemplate<K extends TemplateKey>(key: K, data: TemplateData<K>, opts: RenderOptions = {}): RenderedEmail {
  const def = EMAIL_TEMPLATES[key] as unknown as Def<TemplateData<K>>;
  const b = def.build(data);
  const audience = opts.audience ?? def.audience;
  const cta = b.cta ? { ...b.cta, href: absolute(b.cta.href) } : null;
  const settings = def.category ? notificationSettingsHref(audience) : null;
  const unsub = def.category && !def.always && opts.recipientUserId ? unsubscribeUrl(opts.recipientUserId, def.category) : null;
  const year = new Date().getFullYear();

  const rowsHtml = b.rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="tint" style="background:${C.tint};border-radius:14px;margin:6px 0 18px;"><tr><td style="padding:16px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${b.rows
        .map(
          (r) =>
            `<tr><td class="body" style="padding:5px 0;color:${C.body};font-size:14px;">${esc(r.label)}</td><td class="ink" align="right" style="padding:5px 0;color:${C.ink};font-size:14px;font-weight:${r.strong ? 700 : 500};">${esc(r.value)}</td></tr>`,
        )
        .join("")}</table></td></tr></table>`
    : "";

  const footerLinks = def.always
    ? `<span>This is a ${def.category === "billing" ? "payment" : "security"} email, so it always sends.</span>`
    : settings
      ? `<a href="${settings}" style="color:${C.muted};text-decoration:underline;">Manage notifications</a>${unsub ? ` &nbsp;·&nbsp; <a href="${unsub}" style="color:${C.muted};text-decoration:underline;">Unsubscribe from this kind of email</a>` : ""}`
      : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(b.subject)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .bg-page { background:#0b0e17 !important; }
    .card, .foot { background:#161c2b !important; border-color:#2a3245 !important; }
    .ink { color:#f0f3fa !important; }
    .body { color:#b7bfd0 !important; }
    .muted, .muted a { color:#8d97ab !important; }
    .tint { background:#1e2740 !important; }
    .btn { background:#4a6cf7 !important; color:#ffffff !important; }
    .logo-light { display:none !important; }
    .logo-dark { display:block !important; }
  }
  @media (max-width:600px){ .card{ border-radius:0 !important; } .pad{ padding-left:22px !important; padding-right:22px !important; } }
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(b.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg-page" style="background:${C.page};padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="card" style="width:600px;max-width:100%;background:${C.card};border:1px solid ${C.hair};border-radius:18px;overflow:hidden;">
<tr><td class="pad" style="padding:30px 40px 6px;">
<img src="${siteOrigin()}/brand/email-logo-navy.png" width="132" height="64" alt="Litch Consulting" class="logo-light" style="display:block;border:0;">
<img src="${siteOrigin()}/brand/email-logo-white.png" width="132" height="64" alt="Litch Consulting" class="logo-dark" style="display:none;border:0;mso-hide:all;">
</td></tr>
<tr><td class="pad" style="padding:18px 40px 30px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.ink};">
<h1 class="ink" style="margin:0 0 14px;font-family:${DISPLAY};font-size:22px;line-height:1.3;color:${C.ink};">${esc(b.heading)}</h1>
${b.greeting ? `<p class="body" style="margin:0 0 12px;color:${C.body};">Hello ${esc(b.greeting)},</p>` : ""}
${b.paragraphs.map((p) => `<p class="body" style="margin:0 0 14px;color:${C.body};">${rich(p)}</p>`).join("")}
${rowsHtml}
${cta ? `<p style="margin:20px 0 10px;"><a href="${esc(cta.href)}" class="btn" style="display:inline-block;background:${C.navy};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 24px;border-radius:10px;">${esc(cta.label)}</a></p>
<p class="muted" style="margin:0 0 6px;font-size:12.5px;color:${C.muted};word-break:break-all;">Or copy this link: <a href="${esc(cta.href)}" style="color:${C.brand};">${esc(cta.href)}</a></p>` : ""}
${b.note ? `<p class="muted" style="margin:12px 0 0;font-size:13px;color:${C.muted};">${esc(b.note)}</p>` : ""}
</td></tr>
<tr><td class="foot pad muted" style="padding:20px 40px 26px;border-top:1px solid ${C.hair};background:${C.card};font-family:${FONT};font-size:12px;line-height:1.7;color:${C.muted};">
<p class="muted" style="margin:0 0 10px;color:${C.muted};">${esc(b.why)}</p>
<p class="muted" style="margin:0 0 10px;color:${C.muted};">${footerLinks}</p>
<p class="muted" style="margin:0;color:${C.muted};">${esc(site.legalName)} · ${esc(site.location)} · Financial reporting, tax, modelling, forensic accounting, advisory<br>© ${year} ${esc(site.legalName)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    b.heading,
    "",
    ...(b.greeting ? [`Hello ${b.greeting},`, ""] : []),
    ...b.paragraphs.map((p) => plain(p) + "\n"),
    ...(b.rows?.length ? [b.rows.map((r) => `${r.label}: ${r.value}`).join("\n"), ""] : []),
    ...(cta ? [`${cta.label}: ${cta.href}`, ""] : []),
    ...(b.note ? [b.note, ""] : []),
    "--",
    b.why,
    ...(def.always ? [] : settings ? [`Manage notifications: ${settings}`] : []),
    ...(unsub ? [`Unsubscribe from this kind of email: ${unsub}`] : []),
    `${site.legalName} · ${site.location}`,
  ].join("\n");

  return { subject: b.subject, html, text, fromName: b.fromName };
}

/** Rendered subject + html for `notifyUsers({ email })`. */
export function templateEmail<K extends TemplateKey>(key: K, data: TemplateData<K>, opts: RenderOptions = {}): { subject: string; html: string } {
  const r = renderTemplate(key, data, opts);
  return { subject: r.subject, html: r.html };
}

/**
 * Render and send one template through the outbox (lib/email.ts). Throws when
 * SMTP fails, like sendEmail; wrap in `after()` when it should not block.
 */
export async function sendTemplate<K extends TemplateKey>(
  key: K,
  data: TemplateData<K>,
  opts: RenderOptions & { to: string; dedupeKey?: string; replyTo?: string; attachments?: MailAttachment[] },
) {
  const r = renderTemplate(key, data, opts);
  return sendEmail({ to: opts.to, subject: r.subject, html: r.html, text: r.text, dedupeKey: opts.dedupeKey, replyTo: opts.replyTo, attachments: opts.attachments });
}

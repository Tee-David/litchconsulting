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
   brand values of the approved email system (the same one MGT and WDC use),
   in Litch's identity: a navy header with the white logo and a blue rule, a
   light hero with an animated navy icon tile and the faded Litch mark, the
   body, one navy button with an icon (full width on phones), and a footer
   with the real contact details. Fixed hex is correct inside an email. */
const C = {
  navy: "#0a196d",
  brand: "#2540c4",
  ink: "#0a0e1a",
  body: "#2f3646",
  muted: "#5d6578",
  line: "#e6e8f0",
  soft: "#f5f6fa",
  page: "#eceef5",
  headerText: "#c7cff2",
  rule: "#4c6ef5",
  hero: "#eef1fb",
  heroTitle: "#0a196d",
  heroSub: "#4f5869",
  trackDone: "#0a196d",
  trackNow: "#4c6ef5",
  trackOff: "#d5dbf2",
};
const FONT = "Outfit,'Segoe UI',Helvetica,Arial,sans-serif";
const DISPLAY = "'Space Grotesk','Segoe UI',Helvetica,Arial,sans-serif";
/** The request stages the hero tracker shows. */
const STAGES = ["Received", "Quoted", "In progress", "Draft review", "Delivered"];
/** "Done: Received, Quoted. Now: In progress." for the phone line under the tracker. */
const stageLine = (now: number, next?: string) =>
  `${now > 0 ? `Done: ${STAGES.slice(0, now).join(", ")}. ` : ""}Now: ${STAGES[now]}.${next ? ` Next: ${next}.` : ""}`;

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
  /** The button. `icon` names a white icon in /public/email (btn-<icon>-white.png). */
  cta?: { label: string; href: string; icon?: string };
  /** The coloured band under the header: a short label, an icon tile, a title and a sub line, and an optional stage tracker. */
  hero?: EmailHero;
  /** Small print under the button (expiry, "ignore if not you"). */
  note?: string;
  /** "You got this because…" — required, specific to this send. */
  why: string;
  /** Display name for the From header, e.g. "Hauwa at Litch Consulting". */
  fromName?: string;
};

/** `icon` names an animated tile in /public/email (tile-<icon>.gif). `stage` indexes STAGES. */
export type EmailHero = { label: string; icon: string; title: string; sub?: string | null; stage?: number; stageLine?: string };

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

/** Where a request status sits on the hero tracker; statuses off the main path show no tracker. */
const UPDATE_STAGE: Record<string, number> = {
  "Quote requested": 0,
  "Quote sent": 1,
  "Awaiting payment": 1,
  "Awaiting documents": 2,
  "In progress": 2,
  "Internal review": 2,
  "Client review": 3,
  Delivered: 4,
  Completed: 4,
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
      hero: { label: "Invitation", icon: "user-plus", title: "You are invited", sub: d.role === "client" ? d.company || "Litch Consulting" : d.role === "admin" ? "Admin access" : "Staff access" },
      cta: { label: "Accept the invitation", href: d.url, icon: "user-plus" },
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
      hero: { label: "Account", icon: "mail-check", title: "Confirm your email", sub: d.serviceName || "One click" },
      cta: { label: "Confirm my email", href: d.url, icon: "mail-check" },
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
      hero: { label: "Security", icon: "lock", title: "New password", sub: "Works once, for 1 hour" },
      cta: { label: "Choose a new password", href: d.url, icon: "lock" },
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
      hero: { label: "Account", icon: "check-circle", title: d.role === "client" ? "Account ready" : "Welcome to the team", sub: d.role === "client" ? "Your client portal" : d.role === "admin" ? "Admin access" : "Staff access" },
      cta: { label: d.role === "client" ? "Open my dashboard" : "Open my work", href: d.homeUrl, icon: "log-in" },
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
      hero: { label: "Security", icon: "shield", title: d.what, sub: fmtDate(d.when) },
      cta: { label: "Review my security", href: `${siteOrigin()}/account/security`, icon: "shield" },
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
      hero: { label: "Team", icon: "users", title: "Invitation accepted", sub: d.personName },
      cta: { label: d.role === "staff" ? "Assign a request" : "Open Team and access", href: `${siteOrigin()}/admin/settings/access${d.role === "staff" ? "?tab=assign" : ""}`, icon: "arrow-right" },
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
      hero: { label: "Quote", icon: "file-text", title: `Quote ${d.quoteNumber}`, sub: d.serviceName, stage: 1, stageLine: stageLine(1) },
      cta: { label: "Review and accept", href: d.url, icon: "check" },
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
      hero: { label: "Action needed", icon: "alert", title: "One thing needed", sub: d.requestNumber },
      cta: { label: "Answer now", href: d.url, icon: "arrow-right" },
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
      hero: { label: "Review", icon: "eye", title: `Draft v${d.version} ready`, sub: d.requestNumber, stage: 3, stageLine: stageLine(3, "Delivered") },
      cta: { label: "Review the draft", href: d.url, icon: "eye" },
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
      hero: { label: "Receipt", icon: "receipt", title: "Payment received", sub: d.receiptNumber },
      cta: { label: "View receipt", href: d.url, icon: "download" },
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
      hero: {
        label: "Summary",
        icon: "list",
        title: d.needsYou.length ? `${d.needsYou.length} ${d.needsYou.length === 1 ? "thing needs" : "things need"} you` : "Nothing needs you",
        sub: `${d.updates.length} ${d.updates.length === 1 ? "update" : "updates"}`,
      },
      cta: { label: "Open my dashboard", href: d.url, icon: "arrow-right" },
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
      hero: { label: "Request", icon: "inbox", title: `Request ${d.requestNumber}`, sub: d.serviceName, stage: 0, stageLine: stageLine(0, d.mode === "quote" ? "your quote" : "your payment") },
      cta: { label: d.mode === "quote" ? "Track your request" : "Complete payment", href: d.url, icon: d.mode === "quote" ? "arrow-right" : "credit-card" },
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
      hero: { label: "Update", icon: "layers", title: d.statusLabel, sub: d.requestNumber, ...(UPDATE_STAGE[d.statusLabel] != null ? { stage: UPDATE_STAGE[d.statusLabel], stageLine: stageLine(UPDATE_STAGE[d.statusLabel]) } : {}) },
      cta: { label: "View progress", href: d.url, icon: "arrow-right" },
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
      hero: { label: "Delivered", icon: "check-circle", title: "Delivered", sub: d.requestNumber, stage: 4, stageLine: "Done: every stage. Delivered." },
      cta: { label: "Download", href: d.url, icon: "download" },
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
      hero: {
        label: d.outcome === "refunded" ? "Refund" : d.outcome === "cancelled" ? "Cancelled" : "Declined",
        icon: d.outcome === "refunded" ? "undo" : "x-circle",
        title: d.outcome === "refunded" ? "Refund confirmed" : d.outcome === "cancelled" ? "Request cancelled" : "Request declined",
        sub: d.requestNumber,
      },
      cta: { label: "Contact support", href: d.url, icon: "message" },
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
      hero: { label: "Invoice", icon: "file-text", title: `Invoice ${d.invoiceNumber}`, sub: d.projectTitle || d.total },
      cta: { label: "View and pay", href: d.url, icon: "credit-card" },
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
      preheader: d.preheader || d.paragraphs[0]?.split("**").join("").slice(0, 120) || d.heading,
      heading: d.heading,
      greeting: first(d.name),
      paragraphs: d.paragraphs,
      rows: d.rows,
      hero: { label: "Notice", icon: "bell", title: "A note from Litch Consulting", sub: fmtDate(new Date()) },
      cta: d.cta ? { ...d.cta, icon: "arrow-right" } : undefined,
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
      hero: { label: "Team", icon: "briefcase", title: "New work", sub: d.requests.length === 1 ? d.requests[0].number : `${d.requests.length} requests` },
      cta: { label: "Open my work", href: d.url, icon: "arrow-right" },
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
const rich = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, `<strong class="lt-ink" style="color:${C.ink};font-weight:600">$1</strong>`).replace(/\n/g, "<br>");
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");
const absolute = (href: string) => (/^https?:\/\//i.test(href) ? href : `${siteOrigin()}${href.startsWith("/") ? "" : "/"}${href}`);

/** Gmail apps force-invert colours in dark mode. A same-colour gradient is left alone, so a fixed band keeps its colour. */
const bg = (c: string) => `background-color:${c};background-image:linear-gradient(${c},${c})`;
/** Light text on a fixed band. Gmail apps darken it in forced dark mode; this block-level blend wrapper undoes that (its classes only match inside Gmail, via u + .body). It wraps whole blocks, never inline text, so no stray edges are drawn. */
const keep = (html: string) => `<div class="lt-gs"><div class="lt-gd">${html}</div></div>`;
const T = (a = "") => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${a}>`;

/** Label and value rows: the facts of the email. A strong row is the figure that matters, set larger and right-aligned. */
function facts(rows: Array<{ label: string; value: string; strong?: boolean }>) {
  const cells = rows
    .map(
      (r) =>
        `<tr><td class="lt-line lt-muted" width="150" valign="top" style="padding:12px 16px 12px 0;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:14px;line-height:1.5;color:${C.muted}">${esc(r.label)}</td>` +
        `<td class="lt-line lt-ink" valign="top"${r.strong ? ' align="right"' : ""} style="padding:12px 0;border-bottom:1px solid ${C.line};font-family:${r.strong ? DISPLAY : FONT};font-size:${r.strong ? 18 : 15}px;line-height:1.5;font-weight:${r.strong ? 700 : 500};color:${C.ink};font-variant-numeric:tabular-nums">${esc(r.value)}</td></tr>`,
    )
    .join("");
  return `${T(`width="100%" class="lt-line" style="margin:0 0 24px;border-top:1px solid ${C.line}"`)}${cells}</table>`;
}

/** The one action: a navy button with a white icon before the label. Full width on phones. */
function button(label: string, href: string, icon: string) {
  const o = siteOrigin();
  return (
    `${T('class="lt-btn-t" style="margin:8px 0 24px"')}<tr><td class="lt-btn" bgcolor="${C.navy}" style="${bg(C.navy)};border-radius:8px">` +
    `<a class="lt-btn-a" href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:8px">` +
    `${keep(`<img src="${o}/email/btn-${icon}-white.png" width="18" height="18" alt="" style="display:inline-block;width:18px;height:18px;border:0;vertical-align:middle;margin-right:8px"><span style="vertical-align:middle;color:#ffffff">${esc(label)}</span>`)}</a>` +
    `</td></tr></table>`
  );
}

/** The request stages: done in navy, now in blue, to come in pale blue. Labels on wide screens, one line on phones. */
function tracker(now: number, line: string) {
  const n = STAGES.length, w = (100 / n).toFixed(2);
  const bar = STAGES.map((_, i) => {
    const color = i < now ? C.trackDone : i === now ? C.trackNow : C.trackOff;
    const cls = i < now ? "lt-trk-done" : i > now ? "lt-trk-off" : "";
    return `<td width="${w}%" valign="top" style="padding:0 ${i < n - 1 ? 4 : 0}px 0 0"><div class="${cls}" style="height:6px;line-height:6px;font-size:0;${bg(color)};border-radius:3px">&nbsp;</div></td>`;
  }).join("");
  const labels = STAGES.map((s, i) => `<td width="${w}%" valign="top" class="${i === now ? "lt-hero-t" : "lt-hero-s"}" style="padding:10px ${i < n - 1 ? 4 : 0}px 0 0;font-family:${FONT};font-size:12px;line-height:1.35;font-weight:${i === now ? 700 : 400};color:${i === now ? C.heroTitle : C.heroSub}">${esc(s)}</td>`).join("");
  return `${T('width="100%" style="margin-top:20px"')}<tr>${bar}</tr></table>
<div class="lt-hide-sm">${T('width="100%"')}<tr>${labels}</tr></table></div>
<!--[if !mso]><!--><div class="lt-show-sm" style="display:none"><p class="lt-hero-s" style="margin:12px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.heroSub}">${esc(line)}</p></div><!--<![endif]-->`;
}

/** The light hero: a navy icon tile and the faded Litch mark, then the title, the sub line and the optional tracker.
 *  The hero is a light band with navy text, so it is not locked: a client that darkens the page darkens it too, and
 *  the mark (9% blue on a clear ground) stays faint. Only the navy tile is locked. */
function hero(h: EmailHero) {
  const o = siteOrigin();
  return `<tr><td bgcolor="${C.hero}" class="lt-pad lt-hero" style="padding:0 0 0 40px;background:${C.hero}">${T('width="100%"')}<tr>
<td valign="top" style="padding:28px 0 0">${T()}<tr><td bgcolor="${C.navy}" width="52" height="52" align="center" valign="middle" style="width:52px;height:52px;${bg(C.navy)};border-radius:12px;line-height:0"><img src="${o}/email/tile-${h.icon}.gif" width="32" height="32" alt="" style="display:block;border:0;width:32px;height:32px"></td></tr></table></td>
<td class="lt-hero-mark" align="right" valign="top" width="160" style="line-height:0;font-size:0"><img class="lt-ico-l" src="${o}/email/hero-mark.png" width="160" height="112" alt="" style="display:block;border:0;width:160px;height:112px"><img class="lt-ico-d" src="${o}/email/hero-mark-dark.png" width="160" height="112" alt="" style="display:none;border:0;width:160px;height:112px"></td></tr></table></td></tr>
<tr><td bgcolor="${C.hero}" class="lt-pad lt-hero" style="padding:12px 40px 32px;background:${C.hero}">
<p class="lt-hero-t" style="margin:0;font-family:${DISPLAY};font-size:21px;line-height:1.3;font-weight:700;color:${C.heroTitle}">${esc(h.title)}</p>
${h.sub ? `<p class="lt-hero-s" style="margin:4px 0 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.heroSub}">${esc(h.sub)}</p>` : ""}
${h.stage != null ? tracker(h.stage, h.stageLine ?? stageLine(h.stage)) : ""}
</td></tr>`;
}

/* Phone layout and dark colours. `background:` shorthand also clears the locking gradient, so dark mode still repaints a band. */
const CSS = `:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;-webkit-text-size-adjust:100%}
.lt-show-sm{display:none}
.lt-ico-d{display:none}
@media only screen and (max-width:620px){
  .lt-outer{padding:8px 0 !important}
  .lt-wrap{width:100% !important}
  .lt-pad{padding-left:24px !important;padding-right:24px !important}
  .lt-h1{font-size:25px !important}
  .lt-col{display:block !important;width:100% !important;padding:0 0 4px 0 !important}
  .lt-hide-sm{display:none !important}
  .lt-show-sm{display:block !important}
  .lt-hero-mark{display:none !important}
  .lt-btn-t{width:100% !important}
  .lt-btn-a{display:block !important;text-align:center !important}
}
@media (prefers-color-scheme: dark){
  .lt-page{background:#0b0e17 !important}
  .lt-card{background:#161c2b !important;border-color:#2a3245 !important}
  .lt-ink{color:#f0f3fa !important}
  .lt-body{color:#c3cad9 !important}
  .lt-muted{color:#9aa3b8 !important}
  .lt-line{border-color:#2a3245 !important}
  .lt-soft{background:#1e2740 !important;border-color:#2a3245 !important}
  .lt-btn{background:#4a6cf7 !important}
  .lt-hero{background:#121a33 !important}
  .lt-hero-t{color:#ffffff !important}
  .lt-hero-s{color:#b7bfd0 !important}
  .lt-trk-off{background:#2a3245 !important}
  .lt-trk-done{background:#c7d2ff !important}
  .lt-ico-l{display:none !important}
  .lt-ico-d{display:block !important}
}
u + .body .lt-gs{background:#000;mix-blend-mode:screen}
u + .body .lt-gd{background:#000;mix-blend-mode:difference}
[data-ogsc] .lt-ink{color:#f0f3fa !important}
[data-ogsc] .lt-body{color:#c3cad9 !important}
[data-ogsc] .lt-muted{color:#9aa3b8 !important}
[data-ogsc] .lt-hero-t{color:#ffffff !important}
[data-ogsc] .lt-hero-s{color:#b7bfd0 !important}
[data-ogsb] .lt-page{background:#0b0e17 !important}
[data-ogsb] .lt-card{background:#161c2b !important}
[data-ogsb] .lt-soft{background:#1e2740 !important}
[data-ogsb] .lt-hero{background:#121a33 !important}
[data-ogsc] .lt-ico-l{display:none !important}
[data-ogsc] .lt-ico-d{display:block !important}`;

export type RenderOptions = {
  /** The recipient's user id: enables the signed one-click unsubscribe link. */
  recipientUserId?: string | null;
  /** Override the template's audience (e.g. a digest to staff). */
  audience?: EmailAudience;
  /** The recipient's address, shown in the footer ("Sent to ..."). sendTemplate passes it. */
  to?: string | null;
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
  const o = siteOrigin();
  const h: EmailHero = b.hero ?? { label: "Litch Consulting", icon: "bell", title: b.heading };

  const muted = (html: string, mb = 6) => `<p class="lt-muted" style="margin:0 0 ${mb}px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">${html}</p>`;
  const link = (href: string, t: string) => `<a class="lt-muted" href="${esc(href)}" style="color:${C.muted};text-decoration:underline">${esc(t)}</a>`;
  const footerLinks = def.always
    ? `This is a ${def.category === "billing" ? "payment" : "security"} email, so it always sends.`
    : settings
      ? `${link(settings, "Manage notifications")}${unsub ? ` &nbsp;&middot;&nbsp; ${link(unsub, "Unsubscribe from this kind of email")}` : ""}`
      : "";
  const grp = (label: string, html: string, mb = 16) =>
    `<p class="lt-muted" style="margin:0 0 2px;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted}">${label}</p><div class="lt-ink" style="margin:0 0 ${mb}px;font-family:${FONT};font-size:14px;line-height:1.5;font-weight:500;color:${C.ink}">${html}</div>`;
  // PLACEHOLDER: the RC number is not known yet. When the owner supplies it, add " &middot; RC <number>" here. Social links are left out for the same reason.
  const legal = `&copy; ${year} ${esc(site.legalName)}`;
  const a = (href: string, t: string, u = false) => `<a class="lt-ink" href="${esc(href)}" style="color:${C.ink};text-decoration:${u ? "underline" : "none"}">${esc(t)}</a>`;

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(b.subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
${CSS}
</style>
</head>
<body class="lt-page body" style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(b.preheader)}&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>
${T(`width="100%" class="lt-page" style="background:${C.page}"`)}<tr><td align="center" class="lt-outer" style="padding:32px 12px">
${T(`width="600" class="lt-wrap lt-card" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:14px;overflow:hidden"`)}

<tr><td bgcolor="${C.navy}" class="lt-pad" style="padding:18px 40px;${bg(C.navy)}">${T('width="100%"')}<tr>
<td valign="middle"><a href="${o}" style="text-decoration:none"><img src="${o}/brand/email-logo-white.png" width="98" height="48" alt="${esc(site.name)}" style="display:block;width:98px;height:48px;border:0;color:#ffffff;font-family:${DISPLAY};font-size:17px;font-weight:700"></a></td>
<td valign="middle" align="right" style="font-family:${FONT};font-size:13px;line-height:1.4;color:${C.headerText}">${keep(`<span style="color:${C.headerText}">${esc(h.label)}</span>`)}</td></tr></table></td></tr>
<tr><td height="2" style="height:2px;line-height:2px;font-size:0;${bg(C.rule)}">&nbsp;</td></tr>
${hero(h)}

<tr><td class="lt-pad" style="padding:36px 40px 16px">
<h1 class="lt-ink lt-h1" style="margin:0 0 20px;font-family:${DISPLAY};font-size:28px;line-height:1.18;font-weight:700;letter-spacing:-0.02em;color:${C.ink}">${esc(b.heading)}</h1>
${b.greeting ? `<p class="lt-body" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${C.body}">Hello ${esc(b.greeting)},</p>` : ""}
${b.paragraphs.map((p) => `<p class="lt-body" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${C.body}">${rich(p)}</p>`).join("\n")}
${b.rows?.length ? facts(b.rows) : ""}
${cta ? button(cta.label, cta.href, cta.icon ?? "arrow-right") : ""}
${b.note ? `<p class="lt-muted" style="margin:0 0 24px;font-family:${FONT};font-size:14px;line-height:1.6;color:${C.muted};word-break:break-word">${esc(b.note)}</p>` : ""}
</td></tr>

<tr><td class="lt-soft lt-line lt-pad" style="padding:32px 40px;background:${C.soft};border-top:1px solid ${C.line}">
${T('width="100%" style="margin:0 0 20px"')}<tr><td valign="middle">${T()}<tr><td bgcolor="${C.navy}" style="${bg(C.navy)};border-radius:10px;padding:8px 14px"><a href="${o}" style="text-decoration:none;display:block"><img src="${o}/brand/email-logo-white.png" width="82" height="40" alt="${esc(site.name)}" style="display:block;width:82px;height:40px;border:0;color:#ffffff;font-family:${DISPLAY};font-size:15px;font-weight:700"></a></td></tr></table>
<p class="lt-muted" style="margin:10px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted}">${esc(site.tagline)}</p></td></tr></table>
${T('width="100%" style="margin:0 0 4px"')}<tr>
<td class="lt-col" width="50%" valign="top" style="padding:0 16px 0 0">
${grp("Call or WhatsApp", `${a(`tel:${site.phoneHref}`, site.phone)} <span class="lt-muted" style="color:${C.muted}">&middot;</span> ${a(`https://wa.me/${site.phoneHref.replace("+", "")}`, "WhatsApp", true)}`)}
${grp("Email", a(`mailto:${site.email}`, site.email))}</td>
<td class="lt-col" width="50%" valign="top">
${grp("Based in", esc(site.location))}
${grp("What we do", "Financial reporting, tax, modelling, forensic accounting and advisory", 0)}</td>
</tr></table>
${T('width="100%"')}<tr><td class="lt-line" style="border-top:1px solid ${C.line};padding-top:16px">
${muted(`${esc(b.why)}${opts.to ? ` Sent to <span class="lt-ink" style="color:${C.ink}">${esc(opts.to)}</span>.` : ""}`)}
${footerLinks ? muted(footerLinks) : ""}
${muted(legal, 0)}
</td></tr></table></td></tr>

</table>
</td></tr></table>
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

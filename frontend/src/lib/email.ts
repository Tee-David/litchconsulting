import "server-only";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { and, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import { site } from "@/lib/content";
import { db } from "@/lib/db/client";
import { emailOutbox } from "@/lib/db/schema";

/**
 * Transactional email over SMTP (Truehost). Values come from SMTP_* env vars.
 * Degrades gracefully when unconfigured (logs instead of throwing) so local
 * dev and previews don't break.
 *
 * EVERY SEND GOES THROUGH THE OUTBOX (`email_outbox`): a row is written before
 * the SMTP call and settled after, so a message that fails behind the response
 * still leaves a trace someone can find, and `/api/cron/outbox` can retry it.
 *
 * CALLERS MUST NOT FIRE-AND-FORGET. On Vercel a `void sendX()` can be frozen
 * mid-handshake when the response returns (Truehost spends ~20s authenticating).
 * Use `after(() => sendX())` from `next/server` for anything that should not
 * block the response, or `await` it when the caller needs the outcome.
 */
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 465);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const FROM = process.env.SMTP_FROM || (user ? `${site.name} <${user}>` : undefined);

export const emailConfigured = Boolean(host && user && pass);

let transporter: nodemailer.Transporter | null = null;
function getTransport() {
  if (!emailConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // SSL on 465, STARTTLS otherwise
      requireTLS: port !== 465, // never fall back to plaintext on 587
      auth: { user, pass },
      // Bounded, but generous: this host has been measured at ~20s for AUTH.
      // Unbounded defaults let a sick server hang a function until it is killed.
      connectionTimeout: 15_000,
      greetingTimeout: 30_000,
      socketTimeout: 45_000,
    });
  }
  return transporter;
}

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: MailAttachment[];
  /**
   * Names the EVENT this mail is about (e.g. `invoice-sent:<id>:<ts>`). A
   * second send with the same key is skipped once the first succeeded or is
   * still in flight. Omit for genuinely one-off mail; a random key is used.
   */
  dedupeKey?: string;
};

const MAX_ATTEMPTS = 5;
/** A queued row older than this is assumed dead (function killed mid-send). */
const IN_FLIGHT_MS = 10 * 60_000;

/** Short, secret-free error string for the ledger. */
function errText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/\s+/g, " ").slice(0, 300);
}

type Opened = { kind: "row"; id: string } | { kind: "duplicate" } | { kind: "unlogged" };

/**
 * Claim the outbox row for this event. A previously FAILED (or stale queued)
 * row is re-claimed so the event can be retried; a sent or in-flight one is a
 * duplicate. A database failure never blocks mail: we send unlogged.
 */
async function openRow(msg: EmailMessage, dedupeKey: string): Promise<Opened> {
  const to = Array.isArray(msg.to) ? msg.to.join(", ") : msg.to;
  const retryable = !msg.attachments?.length;
  const payload = retryable
    ? { to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, replyTo: msg.replyTo }
    : null;
  try {
    const inserted = await db
      .insert(emailOutbox)
      .values({ dedupeKey, to, subject: msg.subject, retryable, payload, attempts: 1 })
      .onConflictDoNothing({ target: emailOutbox.dedupeKey })
      .returning({ id: emailOutbox.id });
    if (inserted[0]) return { kind: "row", id: inserted[0].id };

    const staleBefore = new Date(Date.now() - IN_FLIGHT_MS);
    const reclaimed = await db
      .update(emailOutbox)
      .set({
        status: "queued",
        attempts: sql`${emailOutbox.attempts} + 1`,
        payload,
        retryable,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailOutbox.dedupeKey, dedupeKey),
          sql`(${emailOutbox.status} IN ('failed','skipped') OR (${emailOutbox.status} = 'queued' AND ${emailOutbox.updatedAt} < ${staleBefore}))`,
        ),
      )
      .returning({ id: emailOutbox.id });
    return reclaimed[0] ? { kind: "row", id: reclaimed[0].id } : { kind: "duplicate" };
  } catch (e) {
    console.warn("[email] outbox unavailable — sending unlogged:", errText(e));
    return { kind: "unlogged" };
  }
}

async function settleRow(
  id: string,
  status: "sent" | "failed" | "skipped",
  fields: { error?: string; durationMs?: number } = {},
) {
  try {
    await db
      .update(emailOutbox)
      .set({
        status,
        lastError: fields.error ?? null,
        durationMs: fields.durationMs ?? null,
        sentAt: status === "sent" ? new Date() : null,
        // The body is kept only while the row may need a resend.
        ...(status === "sent" ? { payload: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(emailOutbox.id, id));
  } catch (e) {
    console.warn("[email] could not settle outbox row:", errText(e));
  }
}

/**
 * The one door every outbound email leaves through. Same contract as before:
 * throws when the SMTP send fails (callers already wrap it), returns
 * `{ delivered:false }` when SMTP is unconfigured, and now also
 * `{ delivered:false, duplicate:true }` when this event was already mailed.
 */
export async function sendEmail(opts: EmailMessage): Promise<{ delivered: boolean; duplicate?: boolean }> {
  const { dedupeKey, ...mail } = opts;
  const opened = await openRow(opts, dedupeKey ?? `adhoc:${randomUUID()}`);
  if (opened.kind === "duplicate") return { delivered: false, duplicate: true };
  const rowId = opened.kind === "row" ? opened.id : null;

  const t = getTransport();
  if (!t) {
    console.info(`[email] SMTP not configured — skipping "${opts.subject}" to`, opts.to);
    if (rowId) await settleRow(rowId, "skipped", { error: "SMTP is not configured on this deployment." });
    return { delivered: false };
  }

  const started = Date.now();
  try {
    await t.sendMail({ from: FROM, ...mail });
    if (rowId) await settleRow(rowId, "sent", { durationMs: Date.now() - started });
    return { delivered: true };
  } catch (e) {
    if (rowId) await settleRow(rowId, "failed", { error: errText(e), durationMs: Date.now() - started });
    throw e;
  }
}

/**
 * Resend failed, replayable outbox rows (cron: /api/cron/outbox). Bounded per
 * run and per row (MAX_ATTEMPTS), only for the last 3 days — older failures
 * need a human, not a robot mailing a stale notice.
 */
export async function retryFailedEmails(limit = 20): Promise<{ tried: number; sent: number; failed: number }> {
  const t = getTransport();
  if (!t) return { tried: 0, sent: 0, failed: 0 };
  const since = new Date(Date.now() - 3 * 24 * 60 * 60_000);
  const rows = await db
    .select()
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.status, "failed"),
        eq(emailOutbox.retryable, true),
        isNotNull(emailOutbox.payload),
        lt(emailOutbox.attempts, MAX_ATTEMPTS),
        gt(emailOutbox.createdAt, since),
      ),
    )
    .orderBy(emailOutbox.createdAt)
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const p = row.payload as Pick<EmailMessage, "to" | "subject" | "html" | "text" | "replyTo">;
    // Claim it first so two overlapping cron runs cannot both resend.
    const claimed = await db
      .update(emailOutbox)
      .set({ status: "queued", attempts: sql`${emailOutbox.attempts} + 1`, updatedAt: new Date() })
      .where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "failed")))
      .returning({ id: emailOutbox.id });
    if (!claimed[0]) continue;
    const started = Date.now();
    try {
      await t.sendMail({ from: FROM, ...p });
      await settleRow(row.id, "sent", { durationMs: Date.now() - started });
      sent++;
    } catch (e) {
      await settleRow(row.id, "failed", { error: errText(e), durationMs: Date.now() - started });
      failed++;
    }
  }
  return { tried: rows.length, sent, failed };
}

/* ─────────────────────────────  Templating  ─────────────────────────────

   Email HTML is its own world: table layout (fl/grid unsupported), inline
   styles (most clients strip <style>), 600px cap. Light/dark is best-effort —
   we declare `color-scheme`, default to light inline, and override via a
   prefers-color-scheme block for the clients that honour it (Apple Mail, iOS).
   Colours are the brand tokens: navy #0a196d, brand blue #2540c4, ink/body.  */

const C = {
  navy: "#0a196d",
  brand: "#2540c4",
  ink: "#0a0e1a",
  body: "#41485a",
  muted: "#8a92a6",
  hair: "#e6e8f0",
  tint: "#eef1fb",
  page: "#f4f6fb",
  card: "#ffffff",
  emerald: "#0f9d6e",
};

// Absolute origin for hosted email assets (the logo). Email clients need
// absolute URLs and mostly can't render inline SVG, so the header uses a PNG.
const ASSETS = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.litchconsulting.com").replace(/\/$/, "");

/** A round tinted icon badge (emoji) to head an email — renders even when
 *  images are blocked, and the tint has a dark-mode override. */
export function emailIconBadge(emoji: string, tint = C.tint): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td class="tint" width="46" height="46" align="center" valign="middle" style="background:${tint};border-radius:12px;font-size:22px;line-height:46px;">${emoji}</td></tr></table>`;
}

/**
 * Small white glyphs for button labels. Deliberately unicode, not images or
 * SVG: Gmail strips inline SVG and most clients block remote images by default,
 * so an icon that "renders everywhere" has to be a character.
 */
export const EMAIL_ICONS = {
  check: "✓",
  arrow: "→",
  download: "⬇",
} as const;

/**
 * Brand pill button (bulletproof-ish: padded anchor, no images). `icon` is
 * rendered in a fixed-width span so the glyph never crowds the label.
 */
export function emailButton(href: string, label: string, icon?: string): string {
  const glyph = icon
    ? `<span style="display:inline-block;padding-right:8px;font-size:15px;line-height:1;">${icon}</span>`
    : "";
  return `<a href="${href}" class="btn" style="display:inline-block;background:${C.navy};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:9999px;">${glyph}${label}</a>`;
}

/** Label/value rows in a tinted card — the receipt/order detail block. */
export function emailDetailRows(rows: { label: string; value: string; strong?: boolean }[]): string {
  const body = rows
    .map(
      (r, i) => `
      <tr>
        <td class="body" style="padding:${i === 0 ? "0" : "8px"} 0 8px;color:${C.body};font-size:14px;">${r.label}</td>
        <td class="ink" align="right" style="padding:${i === 0 ? "0" : "8px"} 0 8px;color:${C.ink};font-size:14px;font-weight:${r.strong ? 700 : 500};">${r.value}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="tint" style="background:${C.tint};border-radius:14px;padding:18px 20px;margin:8px 0 4px;"><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr></table>`;
}

/** Full branded email document. `preheader` is the inbox preview snippet. */
export function emailLayout(bodyHtml: string, opts: { preheader?: string } = {}): string {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  a:not(.btn) { color:${C.brand}; }
  @media (prefers-color-scheme: dark) {
    .bg-page { background:#0b0e17 !important; }
    /* Footer must be the SAME surface as the card — a darker footer reads as a
       detached panel floating under the email. */
    .card, .foot { background:#161c2b !important; }
    .card { border-color:#2a3245 !important; }
    .ink { color:#f0f3fa !important; }
    .body { color:#b7bfd0 !important; }
    .muted { color:#8d97ab !important; }
    .hair { border-color:#2a3245 !important; }
    /* Navy-on-navy is invisible: lift the detail card off the surface. */
    .tint { background:#1e2740 !important; }
    /* The navy pill all but disappears on a dark card (and clients then
       auto-invert it to a washed-out lilac). Brighten it instead. */
    .btn { background:#4a6cf7 !important; color:#ffffff !important; }
    /* Brand blue is unreadable on dark — lift links too, but never the button. */
    a:not(.btn) { color:#93aaff !important; }
    /* The navy lockup vanishes on a dark card — swap to the white one. */
    .logo-light { display:none !important; }
    .logo-dark { display:block !important; }
  }
  @media (max-width:600px){ .card{ border-radius:0 !important; } .pad{ padding-left:24px !important; padding-right:24px !important; } }
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background:${C.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader ?? ""}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg-page" style="background:${C.page};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="card" style="width:600px;max-width:100%;background:${C.card};border:1px solid ${C.hair};border-radius:18px;overflow:hidden;">
        <!-- header: the real brand lockup, left-aligned — no heavy colour bar.
             Two variants because a navy logo is invisible on a dark card. -->
        <tr><td align="left" class="pad" style="padding:34px 40px 16px;">
          <img src="${ASSETS}/brand/email-logo-navy.png" width="150" height="73" alt="Litch Consulting" class="logo-light" style="display:block;border:0;outline:none;">
          <img src="${ASSETS}/brand/email-logo-white.png" width="150" height="73" alt="Litch Consulting" class="logo-dark" style="display:none;border:0;outline:none;mso-hide:all;">
        </td></tr>
        <!-- body -->
        <tr><td class="ink pad" style="padding:22px 40px 36px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${C.ink};">
          ${bodyHtml}
        </td></tr>
        <!-- footer: quiet, centred, generous — the references keep this light -->
        <tr><td class="foot hair pad" align="center" style="padding:24px 40px 30px;border-top:1px solid ${C.hair};background:${C.card};">
          <p class="muted" style="margin:0 0 12px;font-size:12px;line-height:1.7;color:${C.muted};">
            ${site.legalName} · ${site.location}<br>
            <a href="mailto:${site.email}" style="color:${C.brand};text-decoration:none;">${site.email}</a>
          </p>
          <p class="muted" style="margin:0 0 12px;font-size:12px;color:${C.muted};">
            <a href="${ASSETS}/legal/privacy-policy" style="color:${C.muted};text-decoration:underline;">Privacy policy</a>
            &nbsp;|&nbsp;
            <a href="${ASSETS}/legal/terms-and-conditions" style="color:${C.muted};text-decoration:underline;">Terms</a>
            &nbsp;|&nbsp;
            <a href="${ASSETS}/contact" style="color:${C.muted};text-decoration:underline;">Contact</a>
          </p>
          <p class="muted" style="margin:0;font-size:11px;line-height:1.6;color:${C.muted};">
            You received this because you have a Litch Consulting account.<br>
            © ${year} ${site.legalName}. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendVerificationEmail(to: string, url: string) {
  const html = emailLayout(
    `
    <p style="margin:0 0 6px;font-size:20px;font-weight:700;">Welcome to Litch Consulting 👋</p>
    <p class="body" style="margin:0 0 22px;color:${C.body};">Confirm your email to secure your account and unlock your client portal — request services, track progress, pay invoices and download deliverables.</p>
    <p style="margin:0 0 24px;">${emailButton(url, "Verify email", EMAIL_ICONS.check)}</p>
    <p class="muted" style="margin:0 0 6px;font-size:13px;color:${C.muted};">Or paste this link into your browser:</p>
    <p style="margin:0 0 18px;font-size:12px;word-break:break-all;"><a href="${url}" style="color:${C.brand};">${url}</a></p>
    <p class="muted" style="margin:0;font-size:13px;color:${C.muted};">This link expires in 1 hour. If you didn't create an account, you can ignore this email.</p>
  `,
    { preheader: "Confirm your email to activate your Litch Consulting account." },
  );
  return sendEmail({
    to,
    subject: "Verify your Litch Consulting email",
    html,
    text: `Welcome to Litch Consulting. Verify your email: ${url}`,
  });
}

export async function sendPasswordResetEmail(to: string, url: string) {
  const html = emailLayout(
    `
    <p style="margin:0 0 6px;font-size:20px;font-weight:700;">Reset your password</p>
    <p class="body" style="margin:0 0 22px;color:${C.body};">We received a request to reset your Litch Consulting password. Choose a new one below — the link expires in 1 hour.</p>
    <p style="margin:0 0 24px;">${emailButton(url, "Reset password", EMAIL_ICONS.arrow)}</p>
    <p class="muted" style="margin:0 0 6px;font-size:13px;color:${C.muted};">Or paste this link into your browser:</p>
    <p style="margin:0 0 18px;font-size:12px;word-break:break-all;"><a href="${url}" style="color:${C.brand};">${url}</a></p>
    <p class="muted" style="margin:0;font-size:13px;color:${C.muted};">If you didn't request this, you can safely ignore this email — your password won't change.</p>
  `,
    { preheader: "Reset your Litch Consulting password (link expires in 1 hour)." },
  );
  return sendEmail({
    to,
    subject: "Reset your Litch Consulting password",
    html,
    text: `Reset your Litch Consulting password: ${url}`,
  });
}

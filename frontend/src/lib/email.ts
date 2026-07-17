import "server-only";
import nodemailer from "nodemailer";
import { site } from "@/lib/content";

/**
 * Transactional email over SMTP (Truehost). Values come from SMTP_* env vars.
 * Degrades gracefully when unconfigured (logs instead of throwing) so local
 * dev and previews don't break.
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
      auth: { user, pass },
    });
  }
  return transporter;
}

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}): Promise<{ delivered: boolean }> {
  const t = getTransport();
  if (!t) {
    console.info(`[email] SMTP not configured — skipping "${opts.subject}" to`, opts.to);
    return { delivered: false };
  }
  await t.sendMail({ from: FROM, ...opts });
  return { delivered: true };
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

/** Brand pill button (bulletproof-ish: padded anchor, no images). */
export function emailButton(href: string, label: string): string {
  return `<a href="${href}" class="btn" style="display:inline-block;background:${C.navy};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:9999px;">${label}</a>`;
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
  @media (prefers-color-scheme: dark) {
    .bg-page { background:#0b0e17 !important; }
    .card { background:#141a27 !important; border-color:#232a3b !important; }
    .ink { color:#eef1f8 !important; }
    .body { color:#aeb6c7 !important; }
    .muted { color:#8791a6 !important; }
    .hair { border-color:#232a3b !important; }
    .tint { background:#1a2140 !important; }
    .foot { background:#0b0e17 !important; }
  }
  a { color:${C.brand}; }
  @media (max-width:600px){ .card{ border-radius:0 !important; } }
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background:${C.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader ?? ""}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg-page" style="background:${C.page};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="card" style="width:600px;max-width:100%;background:${C.card};border:1px solid ${C.hair};border-radius:18px;overflow:hidden;">
        <!-- header -->
        <tr><td style="background:${C.navy};padding:22px 30px;">
          <span style="color:#fff;font-size:19px;font-weight:700;letter-spacing:-0.01em;">Litch Consulting</span>
          <span style="color:#9fb0ff;font-size:12px;font-weight:500;"> &nbsp;·&nbsp; Clarity in every number</span>
        </td></tr>
        <!-- body -->
        <tr><td class="ink" style="padding:30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.62;color:${C.ink};">
          ${bodyHtml}
        </td></tr>
        <!-- footer -->
        <tr><td class="foot hair" style="padding:20px 30px;border-top:1px solid ${C.hair};background:${C.card};">
          <p class="muted" style="margin:0 0 4px;font-size:12px;color:${C.muted};">${site.legalName} · ${site.location}</p>
          <p class="muted" style="margin:0;font-size:12px;color:${C.muted};">
            <a href="mailto:${site.email}" style="color:${C.brand};text-decoration:none;">${site.email}</a> ·
            <a href="https://www.litchconsulting.com" style="color:${C.brand};text-decoration:none;">litchconsulting.com</a>
          </p>
          <p class="muted" style="margin:8px 0 0;font-size:11px;color:${C.muted};">© ${year} ${site.legalName}. All rights reserved.</p>
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
    <p style="margin:0 0 24px;">${emailButton(url, "Verify email")}</p>
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
    <p style="margin:0 0 24px;">${emailButton(url, "Reset password")}</p>
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

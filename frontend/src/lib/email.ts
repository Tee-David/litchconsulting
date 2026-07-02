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

/** Minimal branded email shell (inline styles for client compatibility). */
export function emailLayout(bodyHtml: string): string {
  return `
  <div style="background:#f5f6fa;padding:32px 0;font-family:Arial,Helvetica,sans-serif;color:#0a0e1a;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e8f0;">
      <div style="background:#0a196d;padding:22px 28px;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">Litch Consulting</span>
      </div>
      <div style="padding:28px;font-size:15px;line-height:1.6;color:#0a0e1a;">
        ${bodyHtml}
      </div>
      <div style="padding:18px 28px;border-top:1px solid #e6e8f0;font-size:12px;color:#8a92a6;">
        ${site.legalName} · ${site.location} · <a href="mailto:${site.email}" style="color:#2540c4;">${site.email}</a>
      </div>
    </div>
  </div>`;
}

function brandButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#0a196d;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:9999px;">${label}</a>`;
}

export async function sendPasswordResetEmail(to: string, url: string) {
  const html = emailLayout(`
    <p style="margin:0 0 14px;">Hi,</p>
    <p style="margin:0 0 20px;">We received a request to reset your Litch Consulting password. Click the button below to choose a new one. This link expires in 1 hour.</p>
    <p style="margin:0 0 22px;">${brandButton(url, "Reset password")}</p>
    <p style="margin:0;color:#5b6474;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
  `);
  return sendEmail({
    to,
    subject: "Reset your Litch Consulting password",
    html,
    text: `Reset your Litch Consulting password: ${url}`,
  });
}

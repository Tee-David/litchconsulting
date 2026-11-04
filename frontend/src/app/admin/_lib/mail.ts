import "server-only";
import { emailButton, emailDetailRows, emailLayout, EMAIL_ICONS } from "@/lib/email";
import { siteOrigin } from "@/lib/site-url";

/**
 * Small branded emails the admin dashboard sends (reminders, asks, review
 * nudges). Every one ends with a line saying why it was sent.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function simpleEmail(opts: {
  heading: string;
  greeting?: string | null;
  paragraphs: string[];
  rows?: { label: string; value: string; strong?: boolean }[];
  cta?: { href: string; label: string };
  why: string;
  preheader?: string;
}): string {
  const link = opts.cta ? (opts.cta.href.startsWith("http") ? opts.cta.href : `${siteOrigin()}${opts.cta.href}`) : null;
  return emailLayout(
    `
    <p style="margin:0 0 6px;font-size:20px;font-weight:700;">${esc(opts.heading)}</p>
    ${opts.greeting ? `<p class="body" style="margin:0 0 12px;color:#41485a;">Hello ${esc(opts.greeting)},</p>` : ""}
    ${opts.paragraphs.map((p) => `<p class="body" style="margin:0 0 12px;color:#41485a;">${p}</p>`).join("")}
    ${opts.rows?.length ? emailDetailRows(opts.rows) : ""}
    ${link && opts.cta ? `<p style="margin:18px 0 12px;">${emailButton(link, opts.cta.label, EMAIL_ICONS.arrow)}</p><p class="muted" style="margin:0 0 12px;color:#8a92a6;font-size:13px;">Or open: <a href="${link}">${link}</a></p>` : ""}
    <p class="muted" style="margin:16px 0 0;color:#8a92a6;font-size:12px;">${esc(opts.why)}</p>
  `,
    { preheader: opts.preheader },
  );
}

export { esc as escapeHtml };

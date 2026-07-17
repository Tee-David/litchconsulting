import "server-only";
import { emailLayout } from "@/lib/email";
import { formatMoney } from "@/lib/invoice/money";
import { STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";

export type DigestRequest = { number: string; serviceName: string; status: string };

export type ClientDigestData = {
  clientName: string;
  activeRequests: DigestRequest[];
  amountDue: number;
  currency: string;
  deliverablesReady: number;
  baseUrl: string;
};

function stat(label: string, value: string): string {
  return `
    <td style="padding:0 6px;" width="33%">
      <div style="background:#f5f6fa;border:1px solid #e6e8f0;border-radius:12px;padding:14px 12px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#0a196d;line-height:1;">${value}</div>
        <div style="margin-top:6px;font-size:11px;color:#5b6474;text-transform:uppercase;letter-spacing:0.03em;">${label}</div>
      </div>
    </td>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#0a196d;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:9999px;">${label}</a>`;
}

/** Build the weekly client digest email (subject + branded HTML body). */
export function buildClientDigestEmail(data: ClientDigestData): { subject: string; html: string } {
  const { clientName, activeRequests, amountDue, currency, deliverablesReady, baseUrl } = data;

  const requestsBlock = activeRequests.length
    ? `
      <p style="margin:22px 0 8px;font-size:13px;font-weight:700;color:#0a0e1a;">Active requests</p>
      <ul style="margin:0 0 4px;padding-left:18px;color:#0a0e1a;font-size:14px;line-height:1.7;">
        ${activeRequests
          .slice(0, 6)
          .map(
            (r) =>
              `<li><strong>${r.number}</strong> — ${r.serviceName} <span style="color:#5b6474;">(${
                STATUS_LABELS[r.status as RequestStatus] ?? r.status
              })</span></li>`,
          )
          .join("")}
      </ul>`
    : "";

  const dueBlock =
    amountDue > 0
      ? `<p style="margin:18px 0;font-size:14px;">You have <strong>${formatMoney(
          amountDue,
          currency,
        )}</strong> in outstanding invoices. Settling them keeps your work moving without delay.</p>`
      : "";

  const deliverablesBlock =
    deliverablesReady > 0
      ? `<p style="margin:18px 0;font-size:14px;"><strong>${deliverablesReady}</strong> deliverable${
          deliverablesReady > 1 ? "s are" : " is"
        } ready to review and download in your portal.</p>`
      : "";

  const html = emailLayout(`
    <p style="margin:0 0 14px;">Hi ${clientName || "there"},</p>
    <p style="margin:0 0 18px;">Here's your weekly summary from Litch Consulting.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px 6px;border-collapse:separate;">
      <tr>
        ${stat("Active requests", String(activeRequests.length))}
        ${stat("Amount due", amountDue > 0 ? formatMoney(amountDue, currency) : "—")}
        ${stat("Ready to review", String(deliverablesReady))}
      </tr>
    </table>

    ${deliverablesBlock}
    ${dueBlock}
    ${requestsBlock}

    <p style="margin:24px 0 8px;">${button(`${baseUrl}/dashboard`, "Open your portal")}</p>
    <p style="margin:14px 0 0;color:#8a92a6;font-size:12px;">You're receiving this weekly summary as a Litch Consulting client. You can turn it off any time under Settings in your portal.</p>
  `);

  return {
    subject: `Your weekly Litch Consulting summary`,
    html,
  };
}

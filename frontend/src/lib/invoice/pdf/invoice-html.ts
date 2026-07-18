import "server-only";
import { computeTotals, formatMoney } from "@/lib/invoice/money";
import { issuer as defaultIssuer, type Issuer } from "@/lib/invoice/issuer";
import type { InvoiceData } from "@/lib/invoice/types";
import { notoFontCss, signatureSvgDataUri, markSvgDataUri } from "./assets";

/**
 * Self-contained HTML for the invoice/receipt/quote, styled with inline CSS that
 * mirrors `invoice-preview.tsx` 1:1. Headless Chromium prints this, so the PDF
 * is the same layout engine as the on-screen preview — a true replica, not a
 * hand-synced approximation in a second engine.
 */

const BRAND = "#0a196d";
const INK = "#0a0e1a";
const BODY = "#5b6474";
const MUTED = "#8a92a6";
const HAIR = "#e6e8f0";
const TINT = "#eef1fb";

const STATUS_STAMP: Record<string, { label: string; color: string }> = {
  paid: { label: "PAID", color: "#16a34a" },
  sent: { label: "SENT", color: "#d97706" },
  overdue: { label: "OVERDUE", color: "#dc2626" },
  draft: { label: "DRAFT", color: "#8a92a6" },
  void: { label: "VOID", color: "#8a92a6" },
  accepted: { label: "ACCEPTED", color: "#16a34a" },
  declined: { label: "DECLINED", color: "#dc2626" },
};

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function invoiceHtml({
  data,
  issuer = defaultIssuer,
  variant = "invoice",
  qrDataUrl,
  showPaidBanner = true,
}: {
  data: InvoiceData;
  issuer?: Issuer;
  variant?: "invoice" | "receipt" | "quote";
  qrDataUrl?: string;
  showPaidBanner?: boolean;
}): string {
  const isReceipt = variant === "receipt";
  const isQuote = variant === "quote";
  const title = isQuote ? "QUOTE" : isReceipt ? "RECEIPT" : "INVOICE";
  const totals = computeTotals(data.items);
  const fmt = (n: number) => formatMoney(n, data.currency);
  // Receipts already brand themselves paid (header "PAID ✓" + "Total Paid"), so
  // the banner is invoice-only. When it shows, the diagonal stamp is dropped —
  // same rule as the on-screen preview, so the replica stays 1:1.
  const showBanner = showPaidBanner && data.status === "paid" && !isReceipt;
  const stamp = showBanner ? undefined : STATUS_STAMP[data.status];
  const sig = signatureSvgDataUri();
  const mark = markSvgDataUri();

  const rows =
    data.items.length === 0
      ? `<tr><td colspan="5" style="padding:24px 12px;text-align:center;font-style:italic;color:${MUTED}">No line items yet</td></tr>`
      : data.items
          .map(
            (it, i) => `
        <tr style="border-bottom:1px solid ${HAIR}">
          <td style="padding:10px 12px">
            <div style="font-weight:700">${esc(it.description) || "—"}</div>
            ${it.detail ? `<div style="font-size:11px;color:${BODY};margin-top:2px">${esc(it.detail)}</div>` : ""}
          </td>
          <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${esc(it.quantity)}</td>
          <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${esc(fmt(it.unitPrice))}</td>
          <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">${esc(it.taxRate)}%</td>
          <td style="padding:10px 12px;text-align:right;font-weight:500;font-variant-numeric:tabular-nums">${esc(fmt(totals.lines[i]?.amount ?? 0))}</td>
        </tr>`,
          )
          .join("");

  const meta = [
    { label: "Invoice No.", value: data.number },
    { label: "Issued", value: data.issueDate },
    ...(data.dueDate ? [{ label: "Due", value: data.dueDate }] : []),
    ...(data.projectTitle ? [{ label: "Project", value: data.projectTitle }] : []),
  ]
    .map(
      (m) => `
      <div>
        <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:${MUTED}">${esc(m.label)}</div>
        <div style="font-weight:700;margin-top:3px">${esc(m.value)}</div>
      </div>`,
    )
    .join("");

  const grandLabel = isQuote ? "Total" : isReceipt ? "Total Paid" : "Total Due";

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
${notoFontCss()}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#fff}
body{font-family:'Outfit','NotoSans',-apple-system,'Segoe UI',Roboto,sans-serif;color:${INK};font-size:12px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
/* Bottom padding is small because page.pdf() reserves a bottom margin for the
   running "Page x of y" footer. overflow:visible so content can flow to page 2. */
.page{position:relative;width:100%;padding:44px 44px 18px}
/* Repeat the column headings on every page of a long line-item list. */
thead{display:table-header-group}
tr{page-break-inside:avoid;break-inside:avoid}
/* Never strand these across a page break — a total or a signature alone at the
   top of a sheet reads as an error on a financial document. */
.keep-together{page-break-inside:avoid;break-inside:avoid}
table{width:100%;border-collapse:collapse}
@page{size:A4;margin:0}
</style></head>
<body><div class="page">

  <!-- watermark: masked litch-mark.svg — identical to the preview, so the
       fill-rule="evenodd" emblem is cut out cleanly instead of filling a solid
       disc (that mismatch was the grey-circle blob in the old PDF). -->
  ${
    mark
      ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
           <span style="display:block;width:60%;max-width:360px;aspect-ratio:1;opacity:0.045;background:${BRAND};-webkit-mask:url(${mark}) center/contain no-repeat;mask:url(${mark}) center/contain no-repeat"></span>
         </div>`
      : ""
  }

  ${
    stamp
      ? `<div style="position:absolute;top:104px;right:52px;transform:rotate(-12deg);opacity:0.7">
           <span style="display:inline-block;border:3px solid ${stamp.color};color:${stamp.color};border-radius:8px;padding:2px 12px;font-family:'Space Grotesk','NotoSans',sans-serif;font-size:22px;font-weight:800;letter-spacing:1px;text-transform:uppercase">${esc(stamp.label)}</span>
         </div>`
      : ""
  }

  ${
    showBanner
      ? `<div style="position:relative;display:flex;align-items:center;gap:10px;background:#eafaf0;border:1px solid #c9efd8;color:#16a34a;border-radius:8px;padding:12px 16px;margin-bottom:22px;font-weight:600;font-size:13px">
           <span style="font-size:15px;line-height:1">✓</span><span>Invoice paid${data.paidAt ? ` on ${esc(data.paidAt)}` : ""}</span>
         </div>`
      : ""
  }

  <!-- header -->
  <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
    <div>
      <div style="font-size:18px;font-weight:700;color:${BRAND}">${esc(issuer.name)}</div>
      <div style="margin-top:4px;font-size:11px;line-height:1.5;color:${BODY}">${esc(issuer.address)}<br>${esc(issuer.email)}<br>${esc(issuer.phone)}</div>
      ${isReceipt ? `<div style="margin-top:8px;color:#16a34a;font-weight:700">PAID ✓</div>` : ""}
    </div>
    <div style="text-align:right">
      <div style="font-size:30px;font-weight:800;letter-spacing:-0.5px">${title}</div>
      <div style="height:3px;width:64px;border-radius:2px;background:${BRAND};margin-top:6px;margin-left:auto"></div>
    </div>
  </div>

  <!-- meta -->
  <div style="position:relative;display:flex;gap:32px;margin-top:28px">${meta}</div>

  <!-- bill to -->
  <div style="position:relative;margin-top:28px">
    <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:${MUTED}">Bill to</div>
    ${data.billTo.company ? `<div style="font-weight:700;margin-top:5px">${esc(data.billTo.company)}</div>` : ""}
    ${data.billTo.name ? `<div style="margin-top:2px">${esc(data.billTo.name)}</div>` : ""}
    ${data.billTo.address ? `<div style="margin-top:2px;color:${BODY}">${esc(data.billTo.address)}</div>` : ""}
    ${data.billTo.email ? `<div style="margin-top:2px;color:${BODY}">${esc(data.billTo.email)}</div>` : ""}
    ${data.billTo.taxId ? `<div style="margin-top:2px;color:${BODY}">Tax ID: ${esc(data.billTo.taxId)}</div>` : ""}
    ${!data.billTo.company && !data.billTo.name ? `<div style="margin-top:5px;font-style:italic;color:${MUTED}">No client selected</div>` : ""}
  </div>

  <!-- items -->
  <div style="position:relative;margin-top:24px">
    <table>
      <thead>
        <tr style="background:${TINT}">
          <th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${BRAND};border-radius:4px 0 0 4px">Description</th>
          <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${BRAND}">Qty</th>
          <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${BRAND}">Unit Price</th>
          <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${BRAND}">Tax</th>
          <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${BRAND};border-radius:0 4px 4px 0">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <!-- totals -->
  <div class="keep-together" style="position:relative;margin-top:18px;display:flex;justify-content:flex-end">
    <div style="width:260px">
      <div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:${BODY}">Subtotal</span><span style="font-variant-numeric:tabular-nums">${esc(fmt(totals.subtotal))}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:${BODY}">Tax</span><span style="font-variant-numeric:tabular-nums">${esc(fmt(totals.taxTotal))}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;background:${BRAND};color:#fff;padding:10px 12px;border-radius:4px;margin-top:8px;font-weight:700">
        <span>${grandLabel} (${esc(data.currency)})</span><span style="font-variant-numeric:tabular-nums">${esc(fmt(totals.total))}</span>
      </div>
    </div>
  </div>

  ${
    !isReceipt && !isQuote && data.paymentUrl
      ? `<div style="position:relative;margin-top:18px"><a href="${esc(data.paymentUrl)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:9999px">Pay this invoice</a></div>`
      : ""
  }

  <!-- signature -->
  <div class="keep-together" style="position:relative;margin-top:30px;display:flex;justify-content:flex-end">
    <div style="text-align:center">
      ${
        sig
          ? `<img src="${sig}" alt="" style="height:60px;object-fit:contain;margin:0 auto -6px;display:block"/>`
          : `<div style="height:44px"></div>`
      }
      <div style="width:180px;border-top:1px solid ${INK};margin:0 auto"></div>
      <div style="margin-top:5px;font-weight:700">${esc(issuer.signatory.name)}</div>
      <div style="margin-top:1px;font-size:11px;color:${MUTED}">Authorised signatory</div>
    </div>
  </div>

  <!-- payment details + QR -->
  <div class="keep-together" style="position:relative;margin-top:26px;border-top:1px solid ${HAIR};padding-top:18px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px">
    <div>
      <div style="font-weight:700;margin-bottom:4px">Payment details</div>
      <div style="color:${BODY}">Bank: ${esc(issuer.bank.name)}</div>
      <div style="color:${BODY}">Account name: ${esc(issuer.bank.accountName)}</div>
      <div style="color:${BODY}">Account number: ${esc(issuer.bank.accountNumber)}</div>
    </div>
    ${
      qrDataUrl
        ? `<div style="text-align:center"><img src="${qrDataUrl}" style="width:62px;height:62px"/><div style="font-size:8px;color:${BODY};margin-top:2px">${isReceipt ? "Scan to view" : "Scan to pay"}</div></div>`
        : ""
    }
  </div>

  ${
    data.notes
      ? `<div style="position:relative;margin-top:20px"><div style="font-weight:700;margin-bottom:4px">Notes</div><ul style="margin:0;padding:0;list-style:none;color:${BODY}">${data.notes
          .split(/\n+/)
          .filter(Boolean)
          .map((line) => `<li style="display:flex;gap:6px"><span>•</span><span>${esc(line)}</span></li>`)
          .join("")}</ul></div>`
      : ""
  }
  ${data.terms ? `<div style="position:relative;margin-top:16px;font-size:11px;color:${MUTED}">${esc(data.terms)}</div>` : ""}

  <div style="position:relative;margin-top:28px;border-top:1px solid ${HAIR};padding-top:14px;display:flex;justify-content:space-between;font-size:10px;color:${MUTED}">
    <span style="font-weight:700;color:${BRAND}">${esc(issuer.name)}</span>
    <span>${esc(issuer.website)} · ${esc(issuer.phone)}</span>
  </div>

</div></body></html>`;
}

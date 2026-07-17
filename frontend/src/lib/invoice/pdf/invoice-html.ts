import "server-only";
import { computeTotals, formatMoney } from "@/lib/invoice/money";
import { issuer as defaultIssuer, type Issuer } from "@/lib/invoice/issuer";
import type { InvoiceData } from "@/lib/invoice/types";
import { notoFontCss, signatureSvgDataUri } from "./assets";

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

// Litch favicon path (app/icon.svg) — faint centred watermark, as in the preview.
const MARK =
  "M 95.951 2.547 C 68.333 7.549, 41.129 24.428, 23.959 47.215 C 16.113 57.627, 7.603 75.050, 4.282 87.500 C 1.851 96.613, 1.610 99.186, 1.557 116.500 C 1.506 133.369, 1.764 136.498, 3.851 144.394 C 15.154 187.157, 46.858 218.893, 89.500 230.129 C 97.456 232.225, 100.705 232.500, 117.500 232.500 C 139.045 232.500, 146.845 231.051, 163.201 224.013 C 195.997 209.899, 221.603 180.491, 230.692 146.500 C 233.152 137.302, 233.368 134.937, 233.390 117 C 233.411 98.975, 233.212 96.761, 230.757 87.723 C 225.368 67.884, 215.080 50.093, 200.513 35.425 C 183.104 17.896, 161.711 6.595, 138.119 2.467 C 127.770 0.656, 106.166 0.697, 95.951 2.547 M 105 60.441 C 105 77.145, 104.619 88.117, 104.027 88.483 C 103.492 88.814, 102.575 90.865, 101.989 93.042 C 100.537 98.434, 102.266 104.466, 106.467 108.667 L 109.756 111.956 106.378 126.079 C 104.520 133.847, 103 140.382, 103 140.601 C 103 140.821, 117.850 141, 136 141 L 169 141 169 154.500 L 169 168 122.500 168 L 76 168 76 106 C 76 71.900, 75.720 44, 75.377 44 C 73.692 44, 61.802 53.505, 56.443 59.136 C 48.883 67.079, 44.720 73.141, 40.518 82.325 C 34.855 94.703, 33.492 101.702, 33.568 118 C 33.629 131.083, 33.909 133.331, 36.435 141 C 41.713 157.030, 48.350 167.481, 60.311 178.595 C 75.804 192.991, 92.260 199.772, 114.010 200.725 C 153.881 202.472, 188.225 177.298, 199.585 138 C 201.066 132.876, 201.453 128.326, 201.410 116.500 C 201.361 102.854, 201.104 100.733, 198.562 93 C 193.450 77.455, 187.193 67.288, 176.365 56.939 C 159.088 40.426, 140.644 33.021, 116.750 33.007 L 105 33 105 60.441 M 115 67 L 115 81 117.684 81 C 121.860 81, 128.261 84.617, 130.846 88.438 C 135.092 94.712, 133.498 105.103, 127.576 109.762 C 124.859 111.899, 124.735 110.470, 129.101 127.250 L 130.077 131 149.539 131 L 169 131 169 110.589 C 169 87.249, 168.047 82.429, 161.471 72.522 C 153.577 60.630, 137.792 53.069, 120.750 53.017 L 115 53 115 67";

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
}: {
  data: InvoiceData;
  issuer?: Issuer;
  variant?: "invoice" | "receipt" | "quote";
  qrDataUrl?: string;
}): string {
  const isReceipt = variant === "receipt";
  const isQuote = variant === "quote";
  const title = isQuote ? "QUOTE" : isReceipt ? "RECEIPT" : "INVOICE";
  const totals = computeTotals(data.items);
  const fmt = (n: number) => formatMoney(n, data.currency);
  const stamp = STATUS_STAMP[data.status];
  const sig = signatureSvgDataUri();

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
body{font-family:'NotoSans',-apple-system,'Segoe UI',Roboto,sans-serif;color:${INK};font-size:12px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;width:100%;padding:44px 44px 56px;overflow:hidden}
table{width:100%;border-collapse:collapse}
@page{size:A4;margin:0}
</style></head>
<body><div class="page">

  <!-- watermark -->
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
    <svg width="58%" viewBox="0 0 235 234" style="opacity:0.045"><path d="${MARK}" fill="${BRAND}"/></svg>
  </div>

  ${
    stamp
      ? `<div style="position:absolute;top:104px;right:52px;transform:rotate(-12deg);opacity:0.7">
           <span style="display:inline-block;border:3px solid ${stamp.color};color:${stamp.color};border-radius:8px;padding:2px 12px;font-size:22px;font-weight:800;letter-spacing:1px;text-transform:uppercase">${esc(stamp.label)}</span>
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
  <div style="position:relative;margin-top:18px;display:flex;justify-content:flex-end">
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
  <div style="position:relative;margin-top:30px;display:flex;justify-content:flex-end">
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
  <div style="position:relative;margin-top:26px;border-top:1px solid ${HAIR};padding-top:18px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px">
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

  ${data.notes ? `<div style="position:relative;margin-top:20px"><div style="font-weight:700;margin-bottom:4px">Notes</div><div style="color:${BODY}">${esc(data.notes)}</div></div>` : ""}
  ${data.terms ? `<div style="position:relative;margin-top:16px;font-size:11px;color:${MUTED}">${esc(data.terms)}</div>` : ""}

</div></body></html>`;
}

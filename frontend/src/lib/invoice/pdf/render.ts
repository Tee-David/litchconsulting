import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { InvoiceDocument } from "./InvoiceDocument";
import { invoiceHtml } from "./invoice-html";
import { renderHtmlPdf } from "./render-html";
import type { InvoiceData } from "@/lib/invoice/types";
import type { Issuer } from "@/lib/invoice/issuer";

/** Generate a QR code as a PNG data-URI (embeds in the PDF and the email). */
export async function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#0a196d", light: "#ffffff" } });
}

/**
 * Render an invoice (or receipt/quote variant) to a PDF Buffer (server-only).
 *
 * Primary path: print the same HTML the on-screen preview uses via headless
 * Chromium, so the PDF is a true replica rather than a second layout engine's
 * approximation. If Chromium can't launch (a cold serverless miss, a dev box
 * with no browser), fall back to the @react-pdf document — invoicing never
 * fails just because the browser is unavailable.
 */
export async function renderInvoicePdf(
  data: InvoiceData,
  variant: "invoice" | "receipt" | "quote" = "invoice",
  issuer?: Issuer,
  qr?: string,
): Promise<Buffer> {
  try {
    return await renderHtmlPdf(invoiceHtml({ data, variant, issuer, qrDataUrl: qr }));
  } catch (err) {
    console.error("[invoice-pdf] HTML→PDF failed, using @react-pdf fallback:", err instanceof Error ? err.message : err);
    // InvoiceDocument is a pure (hook-free) component returning a <Document>;
    // calling it yields the DocumentElement renderToBuffer expects.
    return renderToBuffer(InvoiceDocument({ data, variant, issuer, qrDataUrl: qr }));
  }
}

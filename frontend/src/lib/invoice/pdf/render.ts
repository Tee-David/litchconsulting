import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { InvoiceDocument } from "./InvoiceDocument";
import type { InvoiceData } from "@/lib/invoice/types";
import type { Issuer } from "@/lib/invoice/issuer";

/** Generate a QR code as a PNG data-URI (embeds in the PDF and the email). */
export async function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#0a196d", light: "#ffffff" } });
}

/** Render an invoice (or receipt variant) to a PDF Buffer (server-only). */
export async function renderInvoicePdf(
  data: InvoiceData,
  variant: "invoice" | "receipt" = "invoice",
  issuer?: Issuer,
  qr?: string,
): Promise<Buffer> {
  // InvoiceDocument is a pure (hook-free) component returning a <Document>;
  // calling it yields the DocumentElement renderToBuffer expects.
  return renderToBuffer(InvoiceDocument({ data, variant, issuer, qrDataUrl: qr }));
}

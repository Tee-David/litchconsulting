import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "./InvoiceDocument";
import type { InvoiceData } from "@/lib/invoice/types";

/** Render an invoice to a PDF Buffer (server-only). */
export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  // InvoiceDocument is a pure (hook-free) component returning a <Document>;
  // calling it yields the DocumentElement renderToBuffer expects.
  return renderToBuffer(InvoiceDocument({ data }));
}

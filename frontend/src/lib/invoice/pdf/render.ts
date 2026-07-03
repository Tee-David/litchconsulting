import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "./InvoiceDocument";
import type { InvoiceData } from "@/lib/invoice/types";
import type { Issuer } from "@/lib/invoice/issuer";

/** Render an invoice (or receipt variant) to a PDF Buffer (server-only). */
export async function renderInvoicePdf(
  data: InvoiceData,
  variant: "invoice" | "receipt" = "invoice",
  issuer?: Issuer,
): Promise<Buffer> {
  // InvoiceDocument is a pure (hook-free) component returning a <Document>;
  // calling it yields the DocumentElement renderToBuffer expects.
  return renderToBuffer(InvoiceDocument({ data, variant, issuer }));
}

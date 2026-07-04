import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { getInvoice, getClientInvoice } from "@/lib/db/queries/invoices";
import { toInvoiceData } from "@/lib/invoice/map";
import { renderInvoicePdf, qrDataUrl } from "@/lib/invoice/pdf/render";
import { getIssuer } from "@/lib/invoice/get-issuer";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  let data;

  if (user.role === "admin") {
    // Admins can download any client's PDF
    data = await getInvoice(id);
  } else {
    // Clients can only download their own PDFs
    const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);
    data = await getClientInvoice(id, clientRow.id);
  }

  if (!data) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const variantParam = url.searchParams.get("variant");

  let effectiveVariant: "invoice" | "receipt" | "quote" = "invoice";
  if (data.invoice.kind === "quote") {
    effectiveVariant = "quote";
  } else if (variantParam === "receipt" && data.invoice.status === "paid") {
    effectiveVariant = "receipt";
  }

  const origin = url.origin;
  const [issuer, qr] = await Promise.all([
    getIssuer(),
    qrDataUrl(`${origin}/i/${data.invoice.publicToken}`),
  ]);

  const pdf = await renderInvoicePdf(toInvoiceData(data.invoice, data.items), effectiveVariant, issuer, qr);
  
  const filename = effectiveVariant === "receipt" 
    ? `receipt-${data.invoice.number}.pdf` 
    : `${data.invoice.number}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

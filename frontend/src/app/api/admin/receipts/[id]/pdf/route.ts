import { isAdmin } from "@/lib/server-user";
import { getInvoice } from "@/lib/db/queries/invoices";
import { toInvoiceData } from "@/lib/invoice/map";
import { renderInvoicePdf, qrDataUrl } from "@/lib/invoice/pdf/render";
import { getIssuer } from "@/lib/invoice/get-issuer";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const data = await getInvoice(id);
  if (!data) return new Response("Not found", { status: 404 });

  const origin = new URL(req.url).origin;
  const [issuer, qr] = await Promise.all([getIssuer(), qrDataUrl(`${origin}/i/${data.invoice.publicToken}`)]);
  const pdf = await renderInvoicePdf(toInvoiceData(data.invoice, data.items), "receipt", issuer, qr);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${data.invoice.number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

import { isAdmin } from "@/lib/server-user";
import { getInvoice } from "@/lib/db/queries/invoices";
import { toInvoiceData } from "@/lib/invoice/map";
import { renderInvoicePdf } from "@/lib/invoice/pdf/render";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const data = await getInvoice(id);
  if (!data) return new Response("Not found", { status: 404 });

  const pdf = await renderInvoicePdf(toInvoiceData(data.invoice, data.items));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${data.invoice.number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

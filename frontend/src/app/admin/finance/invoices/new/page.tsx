import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { InvoiceBuilder } from "@/components/admin/invoice/invoice-builder";
import { listClients, getClient } from "@/lib/db/queries/clients";
import { nextInvoiceNumber } from "@/lib/db/queries/invoices";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { db } from "@/lib/db/client";
import { serviceRequest } from "@/lib/db/schema";
import type { InvoiceInput } from "@/lib/invoice/types";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string; clientId?: string }>;
}) {
  const { requestId, clientId } = await searchParams;
  const [clients, number, issuer] = await Promise.all([
    listClients(),
    nextInvoiceNumber(),
    getIssuer(),
  ]);

  // "Create quote invoice" from a service request → prefill bill-to + line.
  let initial: InvoiceInput | undefined;
  let linkRequestId: string | undefined;
  if (requestId) {
    const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, requestId));
    if (req) {
      const clientRow = await getClient(req.clientId);
      linkRequestId = req.id;
      initial = {
        number,
        clientId: req.clientId,
        billTo: {
          name: clientRow?.name || undefined,
          company: clientRow?.company || undefined,
          email: clientRow?.email || undefined,
          address: clientRow?.address || undefined,
          taxId: clientRow?.taxId || undefined,
        },
        projectTitle: `${req.serviceName} (${req.number})`,
        currency: req.currency,
        issueDate: new Date().toISOString().slice(0, 10),
        notes: req.details ? `Client brief: ${req.details.slice(0, 400)}` : undefined,
        items: [
          {
            description: req.serviceName,
            quantity: 1,
            unitPrice: 0,
            taxRate: 7.5,
          },
        ],
      };
    }
  }

  // "New invoice" from a client profile hub → prefill the bill-to only.
  if (!initial && clientId) {
    const clientRow = await getClient(clientId);
    if (clientRow) {
      initial = {
        number,
        clientId,
        billTo: {
          name: clientRow.name || undefined,
          company: clientRow.company || undefined,
          email: clientRow.email || undefined,
          address: clientRow.address || undefined,
          taxId: clientRow.taxId || undefined,
        },
        currency: "NGN",
        issueDate: new Date().toISOString().slice(0, 10),
        items: [{ description: "", quantity: 1, unitPrice: 0, taxRate: 7.5 }],
      };
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href={linkRequestId ? `/admin/requests/${linkRequestId}` : "/admin/finance/invoices"}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink"
      >
        <ArrowLeft className="size-4" /> {linkRequestId ? "Back to request" : "Invoices"}
      </Link>
      <h2 className="font-display text-lg font-bold text-ink">
        {linkRequestId ? "New invoice for request" : "New invoice"}
      </h2>
      <InvoiceBuilder
        clients={clients}
        defaultNumber={number}
        issuer={issuer}
        initial={initial}
        requestId={linkRequestId}
      />
    </div>
  );
}

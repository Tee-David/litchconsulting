"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { client, serviceRequest, serviceRequestEvent } from "@/lib/db/schema";
import { nextRequestNumber } from "@/lib/db/queries/requests";
import { getCatalogService } from "@/lib/services/catalog";
import { insertInvoiceWithItems } from "@/lib/invoice/persist";
import { emailRequestSubmitted } from "@/lib/emails/requests";
import { recordAudit } from "@/lib/audit";
import { actor, DENIED, failure, type ActionResult } from "../../_lib/guard";

const Input = z.object({
  clientId: z.string().uuid(),
  serviceSlug: z.string().min(1).max(120),
  details: z.string().trim().min(1, "Write a short brief.").max(5000),
});

/**
 * Open a request for a client from the firm side (for example after a call or
 * an email). It follows the same rules as the client's own stepper:
 * - fixed price: an invoice is issued and the request waits for payment; the
 *   client pays from their workspace ("Complete payment").
 * - quote: the request waits for the firm to send a quote.
 * The request belongs to the client's portal login, so the client sees it and
 * gets its emails. A client without a portal login must be invited first.
 */
export async function adminCreateRequestAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await actor("requestsAll");
  if (!me) return DENIED;
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Check the form." };
  const input = parsed.data;

  try {
    const [c] = await db
      .select()
      .from(client)
      .where(and(eq(client.id, input.clientId), isNull(client.deletedAt), isNull(client.erasedAt)));
    if (!c) return { ok: false, error: "We could not find that client." };
    if (!c.userId) {
      return { ok: false, error: "This client has no portal login yet. Invite them from their client page first." };
    }
    const service = await getCatalogService(input.serviceSlug);
    if (!service || !service.active) return { ok: false, error: "This service is not available." };

    const number = await nextRequestNumber();
    const isFixed = service.pricingMode === "fixed" && Boolean(service.priceNgn);
    const status = isFixed ? "pending_payment" : "quote_requested";

    const requestId = await db.transaction(async (tx) => {
      let invoiceId: string | null = null;
      if (isFixed) {
        const inv = await insertInvoiceWithItems(
          {
            status: "sent",
            clientId: c.id,
            billTo: { name: c.name, company: c.company, email: c.email, address: c.address, taxId: c.taxId },
            projectTitle: service.name,
            currency: "NGN",
            dueDate: new Date().toISOString().slice(0, 10),
            items: [
              {
                description: service.name,
                detail: service.turnaround ? `Estimated turnaround: ${service.turnaround}` : null,
                quantity: 1,
                unitPrice: service.priceNgn!,
                taxRate: service.taxRate,
              },
            ],
            createdByUserId: me.id,
          },
          tx,
        );
        invoiceId = inv.id;
      }

      const [row] = await tx
        .insert(serviceRequest)
        .values({
          number,
          clientId: c.id,
          userId: c.userId!,
          serviceSlug: service.slug,
          serviceName: service.name,
          pricingMode: service.pricingMode,
          priceSnapshot: isFixed ? service.priceNgn : null,
          currency: "NGN",
          status,
          details: input.details,
          intake: { openedBy: "firm" },
          requiredDocuments: service.requiredDocuments,
          stepLabels: service.stepLabels,
          invoiceId,
        })
        .returning({ id: serviceRequest.id });

      await tx.insert(serviceRequestEvent).values({
        requestId: row.id,
        type: "created",
        toStatus: status,
        message: isFixed
          ? `Litch Consulting opened this request for ${service.name} on your behalf. Pay the invoice to start the work.`
          : `Litch Consulting opened this request for ${service.name} on your behalf. We will send your quote soon.`,
        visibility: "client",
        actorRole: "admin",
        actorName: me.displayName,
      });
      return row.id;
    });

    await recordAudit({
      action: "request.created_by_firm",
      entity: "request",
      entityId: requestId,
      actorId: me.id,
      actorName: me.displayName,
      meta: { number, clientId: c.id, service: service.slug },
    });

    const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, requestId));
    if (c.email && req) after(() => emailRequestSubmitted(req, c.email!, c.name));

    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    revalidatePath(`/admin/clients/${c.id}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/requests");
    return { ok: true, id: requestId };
  } catch (err) {
    return failure(err, "Could not open the request. Try again.");
  }
}

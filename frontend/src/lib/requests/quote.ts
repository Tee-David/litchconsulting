import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { serviceRequest, serviceRequestEvent } from "@/lib/db/schema";

/**
 * quote_requested → pending_payment once the admin's invoice goes out.
 * Called from sendInvoiceAction and adminLinkInvoiceAction — both already
 * admin-guarded, which is why this lives in lib and not as a server action.
 */
export async function markQuoteSent(requestId: string, invoiceNumber: string): Promise<void> {
  const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, requestId));
  if (!req || req.status !== "quote_requested") return;
  await db.transaction(async (tx) => {
    await tx
      .update(serviceRequest)
      .set({ status: "pending_payment", updatedAt: new Date() })
      .where(and(eq(serviceRequest.id, requestId), eq(serviceRequest.status, "quote_requested")));
    await tx.insert(serviceRequestEvent).values({
      requestId,
      type: "quote_sent",
      fromStatus: "quote_requested",
      toStatus: "pending_payment",
      message: `Your quote is ready — invoice ${invoiceNumber}. Pay from your dashboard whenever you're ready.`,
      visibility: "client",
      actorRole: "admin",
    });
  });
}

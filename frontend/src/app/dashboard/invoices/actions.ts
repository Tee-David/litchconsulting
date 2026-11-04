"use server";

import { acceptQuoteOneClickAction, declineQuoteAction as declineWithReason } from "@/app/dashboard/billing/actions";

/**
 * Legacy quote actions, kept for any old caller. Both now go through the ONE
 * quote path (lib/requests/quote.ts): accepting makes the invoice and pay
 * link; declining records a reason and closes the linked request.
 */

type ActionResult = { ok: boolean; error?: string; invoiceId?: string };

export async function acceptQuoteAction(id: string): Promise<ActionResult> {
  const r = await acceptQuoteOneClickAction(id, "full");
  return r.ok ? { ok: true, invoiceId: r.invoiceId } : { ok: false, error: r.error };
}

export async function declineQuoteAction(id: string, reason = "Declined from the invoice page"): Promise<ActionResult> {
  const r = await declineWithReason(id, reason);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

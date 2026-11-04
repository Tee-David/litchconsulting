"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { invoice, serviceRequest } from "@/lib/db/schema";
import { getPortal } from "@/lib/requests/portal";
import { acceptQuote, declineQuote } from "@/lib/requests/quote";
import { initInvoicePayment } from "@/lib/payments/init";
import { amountFor } from "@/lib/payments/amounts";
import { submitTransferProof } from "@/lib/payments/bank-transfer";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Client billing actions: accept/decline a quote, start a Paystack checkout
 * (deposit, full or balance), and submit bank-transfer proof. The client id
 * always comes from the session; amounts always come from the server.
 */

type Fail = { ok: false; error: string };
const uuid = z.string().uuid();

function revalidate() {
  revalidatePath("/dashboard", "layout");
}

export async function acceptQuoteOneClickAction(quoteId: string, plan: "full" | "deposit"): Promise<{ ok: true; invoiceId: string; invoiceNumber: string } | Fail> {
  const portal = await getPortal();
  if (!portal) return { ok: false, error: "Sign in again to continue." };
  if (!uuid.safeParse(quoteId).success || !["full", "deposit"].includes(plan)) return { ok: false, error: "That quote could not be found." };
  const r = await acceptQuote({ quoteId, clientId: portal.client.id, plan, actor: { userId: portal.user.id, name: portal.client.name || portal.user.name } });
  if (!r.ok) return r;
  revalidate();
  return { ok: true, invoiceId: r.invoiceId, invoiceNumber: r.invoiceNumber };
}

export async function declineQuoteAction(quoteId: string, reason: string): Promise<{ ok: true } | Fail> {
  const portal = await getPortal();
  if (!portal) return { ok: false, error: "Sign in again to continue." };
  if (!uuid.safeParse(quoteId).success) return { ok: false, error: "That quote could not be found." };
  const r = await declineQuote({ quoteId, clientId: portal.client.id, reason: String(reason ?? ""), actor: { userId: portal.user.id, name: portal.client.name || portal.user.name } });
  if (!r.ok) return r;
  revalidate();
  return { ok: true };
}

async function ownInvoice(invoiceId: string, clientId: string) {
  if (!uuid.safeParse(invoiceId).success) return null;
  const [inv] = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.id, invoiceId), eq(invoice.clientId, clientId), eq(invoice.kind, "invoice"), isNull(invoice.deletedAt)));
  return inv ?? null;
}

/** Start Paystack for the chosen option; returns the hosted checkout URL. */
export async function startCardPaymentAction(invoiceId: string, option: string): Promise<{ ok: true; url: string } | Fail> {
  const portal = await getPortal();
  if (!portal) return { ok: false, error: "Sign in again to continue." };
  const rl = await rateLimit(`payinit:${portal.user.id}`, RATE_LIMITS.payInit);
  if (!rl.ok) return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  const inv = await ownInvoice(invoiceId, portal.client.id);
  if (!inv) return { ok: false, error: "That invoice could not be found." };
  const amount = amountFor(inv, option);
  if (amount === null) return { ok: false, error: "Choose how much to pay." };
  const [req] = await db.select({ id: serviceRequest.id }).from(serviceRequest).where(eq(serviceRequest.invoiceId, inv.id));
  const r = await initInvoicePayment(inv, { requestId: req?.id ?? null, email: portal.client.email || portal.user.email, amount });
  if (!r.ok || !r.url) return { ok: false, error: r.error ?? "Could not start the payment." };
  return { ok: true, url: r.url };
}

const proofSchema = z.object({
  invoiceId: z.string().uuid(),
  option: z.enum(["deposit", "full", "balance"]),
  key: z.string().min(1).max(500),
  fileName: z.string().min(1).max(200),
});

export async function submitTransferProofAction(input: z.infer<typeof proofSchema>): Promise<{ ok: true; amount: number } | Fail> {
  const portal = await getPortal();
  if (!portal) return { ok: false, error: "Sign in again to continue." };
  const parsed = proofSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Upload the receipt again." };
  const inv = await ownInvoice(parsed.data.invoiceId, portal.client.id);
  if (!inv) return { ok: false, error: "That invoice could not be found." };
  const r = await submitTransferProof({
    inv,
    option: parsed.data.option,
    proofKey: parsed.data.key,
    proofFileName: parsed.data.fileName,
    actor: { userId: portal.user.id, name: portal.client.name || portal.user.name },
  });
  if (!r.ok) return r;
  revalidate();
  return { ok: true, amount: r.amount };
}

import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice, invoiceItem, serviceRequest, serviceRequestEvent, type Invoice } from "@/lib/db/schema";
import { insertInvoiceWithItems } from "@/lib/invoice/persist";
import { recordAudit } from "@/lib/audit";
import { notifyClient, notifyFirm, simpleEmail } from "@/lib/requests/people";

/**
 * THE quote path (the two parallel paths are merged here).
 *
 *   admin sends a quote (invoice kind='quote', linked via service_request.invoice_id)
 *     → request quote_requested → quote_sent                       markQuoteSent()
 *   client accepts (one click, full or deposit)                      acceptQuote()
 *     → a real invoice (kind='invoice', status 'sent', pay link) replaces the
 *       quote as the request's invoice; quote → accepted; request → pending_payment
 *   client declines with a reason                                    declineQuote()
 *     → quote → declined; request → declined
 *
 * Legacy: when the linked document is already an INVOICE (an admin skipped the
 * quote step), markQuoteSent moves straight to pending_payment as before.
 * Standalone quotes (no request) work the same — accept still makes the invoice.
 */

const today = () => new Date().toISOString().slice(0, 10);

/**
 * quote_requested → quote_sent (linked document is a quote) or → pending_payment
 * (linked document is an invoice). Called by the admin's send/link actions,
 * which are admin-guarded — that is why this lives in lib and not as an action.
 * Signature kept stable.
 */
export async function markQuoteSent(requestId: string, invoiceNumber: string): Promise<void> {
  const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, requestId));
  if (!req || req.status !== "quote_requested") return;
  const [doc] = await db.select().from(invoice).where(eq(invoice.number, invoiceNumber));
  const isQuote = doc?.kind === "quote";
  const toStatus = isQuote ? "quote_sent" : "pending_payment";
  await db.transaction(async (tx) => {
    await tx
      .update(serviceRequest)
      .set({ status: toStatus, ...(doc && !req.invoiceId ? { invoiceId: doc.id } : {}), updatedAt: new Date() })
      .where(and(eq(serviceRequest.id, requestId), eq(serviceRequest.status, "quote_requested")));
    await tx.insert(serviceRequestEvent).values({
      requestId,
      type: "quote_sent",
      fromStatus: "quote_requested",
      toStatus,
      message: isQuote
        ? `Your quote ${invoiceNumber} is ready. Review it and accept in one click from your dashboard.`
        : `Your quote is ready — invoice ${invoiceNumber}. Pay from your dashboard whenever you're ready.`,
      visibility: "client",
      actorRole: "admin",
    });
  });
  const link = isQuote && doc ? `/dashboard/quotes/${doc.id}` : `/dashboard/requests/${requestId}`;
  await notifyClient(req.clientId, {
    category: "actions",
    title: isQuote ? `Your quote for ${req.serviceName} is ready` : `Invoice ready for ${req.serviceName}`,
    body: isQuote ? `${invoiceNumber} · review and accept in one click` : `${invoiceNumber} · pay from your dashboard`,
    link,
    dedupeKey: `quote-sent:${requestId}:${invoiceNumber}`,
    email: await simpleEmail({
      subject: isQuote ? `Your quote ${invoiceNumber} from Litch Consulting` : `Invoice ${invoiceNumber} from Litch Consulting`,
      heading: isQuote ? "Your quote is ready" : "Your invoice is ready",
      body: isQuote
        ? `We have priced ${req.serviceName} (${req.number}). Review the quote and accept it in one click; accepting creates your invoice and pay link.`
        : `Your invoice for ${req.serviceName} (${req.number}) is ready to pay.`,
      href: link,
      cta: isQuote ? "Review quote" : "Pay invoice",
    }),
  });
}

/** The request a quote belongs to (via service_request.invoice_id), if any. */
export async function requestForQuote(quoteId: string) {
  const [req] = await db
    .select()
    .from(serviceRequest)
    .where(and(eq(serviceRequest.invoiceId, quoteId), isNull(serviceRequest.deletedAt)));
  return req ?? null;
}

/** A quote the client may act on: theirs, sent, not expired, not deleted. */
export async function loadClientQuote(quoteId: string, clientId: string): Promise<Invoice | null> {
  const [q] = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.id, quoteId), eq(invoice.clientId, clientId), eq(invoice.kind, "quote"), isNull(invoice.deletedAt)));
  return q ?? null;
}

export function quoteExpired(q: Pick<Invoice, "dueDate">): boolean {
  return Boolean(q.dueDate && q.dueDate < today());
}

export type AcceptResult = { ok: true; invoiceId: string; invoiceNumber: string; requestId: string | null } | { ok: false; error: string };

/**
 * One-click accept: makes the invoice (totals recomputed from the quote's
 * lines), links it to the request, moves the request to pending_payment and
 * tells the firm. Idempotent: a second click returns the invoice already made.
 */
export async function acceptQuote(input: {
  quoteId: string;
  clientId: string;
  plan: "full" | "deposit";
  actor: { userId: string; name: string };
}): Promise<AcceptResult> {
  const q = await loadClientQuote(input.quoteId, input.clientId);
  if (!q) return { ok: false, error: "We could not find that quote on your account." };
  const req = await requestForQuote(q.id);

  if (q.status === "accepted") {
    // Already accepted (double click, second tab): hand back the invoice.
    const linked = req?.invoiceId && req.invoiceId !== q.id ? req.invoiceId : null;
    if (linked) {
      const [inv] = await db.select({ id: invoice.id, number: invoice.number }).from(invoice).where(eq(invoice.id, linked));
      if (inv) return { ok: true, invoiceId: inv.id, invoiceNumber: inv.number, requestId: req?.id ?? null };
    }
    return { ok: false, error: "This quote was already accepted. Your invoice is in Billing." };
  }
  if (!["sent", "viewed"].includes(q.status)) {
    return { ok: false, error: q.status === "declined" ? "This quote was declined. Ask us for a new one." : "This quote is not open for acceptance." };
  }
  if (quoteExpired(q)) return { ok: false, error: `This quote expired on ${q.dueDate}. Ask us to refresh it.` };
  if (input.plan === "deposit" && !q.depositPercent) return { ok: false, error: "This quote does not offer a deposit. Choose to pay in full." };

  const items = await db.select().from(invoiceItem).where(eq(invoiceItem.invoiceId, q.id)).orderBy(invoiceItem.position);
  if (!items.length) return { ok: false, error: "This quote has no lines. Ask us to check it." };

  const due = new Date();
  due.setDate(due.getDate() + 7);

  const created = await db.transaction(async (tx) => {
    // Claim the quote first so two concurrent accepts can't both make invoices.
    const claimed = await tx
      .update(invoice)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(and(eq(invoice.id, q.id), inArray(invoice.status, ["sent", "viewed"])))
      .returning({ id: invoice.id });
    if (!claimed.length) return null;

    const inv = await insertInvoiceWithItems(
      {
        kind: "invoice",
        status: "sent",
        clientId: q.clientId,
        billTo: { name: q.billToName, company: q.billToCompany, email: q.billToEmail, address: q.billToAddress, taxId: q.billToTaxId },
        projectTitle: q.projectTitle,
        currency: q.currency,
        dueDate: due.toISOString().slice(0, 10),
        notes: q.notes ? `${q.notes}\n\nFrom quote ${q.number}.` : `From quote ${q.number}.`,
        terms: q.terms,
        items: items.map((it) => ({
          description: it.description,
          detail: it.detail,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          taxRate: Number(it.taxRate),
        })),
        createdByUserId: input.actor.userId,
      },
      tx,
    );
    if (input.plan === "deposit" && q.depositPercent) {
      await tx.update(invoice).set({ depositPercent: q.depositPercent }).where(eq(invoice.id, inv.id));
    }

    if (req) {
      const from = req.status;
      const advance = ["quote_requested", "quote_sent"].includes(from);
      await tx
        .update(serviceRequest)
        .set({ invoiceId: inv.id, ...(advance ? { status: "pending_payment" } : {}), updatedAt: new Date() })
        .where(eq(serviceRequest.id, req.id));
      await tx.insert(serviceRequestEvent).values({
        requestId: req.id,
        type: "invoice_linked",
        fromStatus: advance ? from : null,
        toStatus: advance ? "pending_payment" : null,
        message:
          input.plan === "deposit"
            ? `You accepted quote ${q.number}. Invoice ${inv.number} is ready: pay the ${q.depositPercent}% deposit to start.`
            : `You accepted quote ${q.number}. Invoice ${inv.number} is ready to pay.`,
        visibility: "client",
        actorRole: "client",
        actorName: input.actor.name,
      });
    }
    return inv;
  });

  if (!created) {
    // Lost the race to another tab: return what that tab made.
    const again = await requestForQuote(q.id);
    const fresh = req ? (await db.select().from(serviceRequest).where(eq(serviceRequest.id, req.id)))[0] : null;
    const id = fresh?.invoiceId ?? again?.invoiceId;
    if (id && id !== q.id) {
      const [inv] = await db.select({ id: invoice.id, number: invoice.number }).from(invoice).where(eq(invoice.id, id));
      if (inv) return { ok: true, invoiceId: inv.id, invoiceNumber: inv.number, requestId: req?.id ?? null };
    }
    return { ok: false, error: "This quote was just accepted in another window. Your invoice is in Billing." };
  }

  await recordAudit({
    actorId: input.actor.userId,
    actorName: input.actor.name,
    action: "quote.accepted",
    entity: "invoice",
    entityId: q.id,
    meta: { quote: q.number, invoice: created.number, plan: input.plan, requestId: req?.id ?? null },
  });
  await notifyFirm(req?.id ?? null, {
    category: "billing",
    title: `${q.billToCompany || q.billToName || "A client"} accepted ${q.number}`,
    body: `Invoice ${created.number} created${input.plan === "deposit" ? ` with a ${q.depositPercent}% deposit` : ""}.`,
    dedupeKey: `quote-accepted:${q.id}`,
    adminLink: `/admin/billing/invoices/${created.id}`,
  });
  return { ok: true, invoiceId: created.id, invoiceNumber: created.number, requestId: req?.id ?? null };
}

/** Decline with a reason. Closes the linked request as declined. */
export async function declineQuote(input: {
  quoteId: string;
  clientId: string;
  reason: string;
  actor: { userId: string; name: string };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const q = await loadClientQuote(input.quoteId, input.clientId);
  if (!q) return { ok: false, error: "We could not find that quote on your account." };
  if (!["sent", "viewed"].includes(q.status)) return { ok: false, error: "This quote is no longer open." };
  const reason = input.reason.trim().slice(0, 1000);
  if (!reason) return { ok: false, error: "Tell us why, so we can do better next time." };
  const req = await requestForQuote(q.id);

  await db.transaction(async (tx) => {
    await tx.update(invoice).set({ status: "declined", updatedAt: new Date() }).where(eq(invoice.id, q.id));
    if (req && ["quote_requested", "quote_sent", "pending_payment"].includes(req.status)) {
      await tx
        .update(serviceRequest)
        .set({ status: "declined", cancelReason: reason, updatedAt: new Date() })
        .where(eq(serviceRequest.id, req.id));
      await tx.insert(serviceRequestEvent).values({
        requestId: req.id,
        type: "declined",
        fromStatus: req.status,
        toStatus: "declined",
        message: `Quote ${q.number} declined: ${reason}`,
        visibility: "client",
        actorRole: "client",
        actorName: input.actor.name,
      });
    }
  });

  await recordAudit({
    actorId: input.actor.userId,
    actorName: input.actor.name,
    action: "quote.declined",
    entity: "invoice",
    entityId: q.id,
    meta: { quote: q.number, reason, requestId: req?.id ?? null },
  });
  await notifyFirm(req?.id ?? null, {
    category: "billing",
    title: `${q.billToCompany || q.billToName || "A client"} declined ${q.number}`,
    body: reason,
    dedupeKey: `quote-declined:${q.id}`,
    adminLink: `/admin/billing/quotes/${q.id}`,
  });
  return { ok: true };
}

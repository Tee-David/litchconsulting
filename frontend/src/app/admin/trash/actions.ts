"use server";

import { revalidatePath } from "next/cache";
import { and, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { client, invoice, invoiceItem, serviceRequest, ticket, ticketMessage } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { num } from "@/lib/invoice/money";
import { actor, DENIED } from "../_lib/guard";

const item = z.object({ type: z.enum(["client", "request", "invoice", "ticket"]), id: z.string().uuid() });
const list = z.array(item).min(1).max(500);
type Res = { ok: true; message: string } | { ok: false; error: string };

const group = (items: z.infer<typeof list>, t: string) => items.filter((i) => i.type === t).map((i) => i.id);

function touch() {
  for (const p of ["/admin/trash", "/admin/clients", "/admin/requests", "/admin/billing", "/admin/help-desk", "/admin"]) revalidatePath(p);
}

/** Restore anything in Trash. */
export async function restoreTrashAction(items: z.infer<typeof list>): Promise<Res> {
  if (!(await actor("trash"))) return DENIED;
  const parsed = list.safeParse(items);
  if (!parsed.success) return { ok: false, error: "Select something to restore." };
  const p = parsed.data;
  const ids = (t: string) => group(p, t);
  if (ids("client").length) await db.update(client).set({ deletedAt: null }).where(inArray(client.id, ids("client")));
  if (ids("request").length) await db.update(serviceRequest).set({ deletedAt: null }).where(inArray(serviceRequest.id, ids("request")));
  if (ids("invoice").length) await db.update(invoice).set({ deletedAt: null }).where(inArray(invoice.id, ids("invoice")));
  if (ids("ticket").length) await db.update(ticket).set({ deletedAt: null }).where(inArray(ticket.id, ids("ticket")));
  await recordAudit({ action: "trash.restored", entity: "trash", meta: { count: p.length, types: [...new Set(p.map((i) => i.type))] } });
  touch();
  return { ok: true, message: `Restored ${p.length} ${p.length === 1 ? "item" : "items"}.` };
}

/**
 * Delete for good. Only rows already in Trash are touched; invoices with money
 * on them are refused (tax records are kept).
 */
export async function purgeTrashAction(items: z.infer<typeof list>): Promise<Res> {
  if (!(await actor("trash"))) return DENIED;
  const parsed = list.safeParse(items);
  if (!parsed.success) return { ok: false, error: "Select something to delete." };
  const p = parsed.data;
  let n = 0;
  const kept: string[] = [];
  await db.transaction(async (tx) => {
    const c = group(p, "client");
    if (c.length) n += (await tx.delete(client).where(and(inArray(client.id, c), isNotNull(client.deletedAt))).returning({ id: client.id })).length;
    const r = group(p, "request");
    if (r.length) n += (await tx.delete(serviceRequest).where(and(inArray(serviceRequest.id, r), isNotNull(serviceRequest.deletedAt))).returning({ id: serviceRequest.id })).length;
    const t = group(p, "ticket");
    if (t.length) {
      const gone = await tx.delete(ticket).where(and(inArray(ticket.id, t), isNotNull(ticket.deletedAt))).returning({ id: ticket.id });
      if (gone.length) await tx.delete(ticketMessage).where(inArray(ticketMessage.ticketId, gone.map((g) => g.id)));
      n += gone.length;
    }
    const iv = group(p, "invoice");
    if (iv.length) {
      const rows = await tx.select().from(invoice).where(and(inArray(invoice.id, iv), isNotNull(invoice.deletedAt)));
      const ok = rows.filter((x) => num(x.amountPaid) === 0);
      kept.push(...rows.filter((x) => num(x.amountPaid) > 0).map((x) => x.number));
      if (ok.length) {
        await tx.delete(invoiceItem).where(inArray(invoiceItem.invoiceId, ok.map((x) => x.id)));
        n += (await tx.delete(invoice).where(inArray(invoice.id, ok.map((x) => x.id))).returning({ id: invoice.id })).length;
      }
    }
  });
  await recordAudit({ action: "trash.purged", entity: "trash", meta: { count: n, kept } });
  touch();
  return { ok: true, message: `Deleted ${n} for good${kept.length ? `. Kept ${kept.join(", ")}: money was paid on them` : ""}.` };
}

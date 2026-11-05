import { and, desc, isNotNull, isNull } from "drizzle-orm";
import { requireArea } from "@/lib/server-user";
import { db } from "@/lib/db/client";
import { client, invoice, serviceRequest, ticket } from "@/lib/db/schema";
import { PageHead } from "@/components/admin/ui/surface";
import { TrashList, type TrashItem } from "./trash-list";

export const dynamic = "force-dynamic";

/**
 * Trash — soft-deleted clients, requests, invoices and tickets, restorable for
 * 30 days before the sweep cron purges them for good. Erased clients are not
 * shown: their anonymous row anchors kept finance records and must stay.
 */
export default async function TrashPage() {
  await requireArea("trash", "/admin/trash");
  const [clients, requests, invoices, tickets] = await Promise.all([
    db.select().from(client).where(and(isNotNull(client.deletedAt), isNull(client.erasedAt))).orderBy(desc(client.deletedAt)).limit(500),
    db.select().from(serviceRequest).where(isNotNull(serviceRequest.deletedAt)).orderBy(desc(serviceRequest.deletedAt)).limit(500),
    db.select().from(invoice).where(isNotNull(invoice.deletedAt)).orderBy(desc(invoice.deletedAt)).limit(500),
    db.select().from(ticket).where(isNotNull(ticket.deletedAt)).orderBy(desc(ticket.deletedAt)).limit(500),
  ]);
  const items: TrashItem[] = [
    ...clients.map((c) => ({ key: `client:${c.id}`, type: "client" as const, id: c.id, name: c.company || c.name, sub: c.email ?? "", deletedAt: c.deletedAt!.toISOString() })),
    ...requests.map((r) => ({ key: `request:${r.id}`, type: "request" as const, id: r.id, name: `${r.number} · ${r.serviceName}`, sub: r.status.replace(/_/g, " "), deletedAt: r.deletedAt!.toISOString() })),
    ...invoices.map((i) => ({ key: `invoice:${i.id}`, type: "invoice" as const, id: i.id, name: i.number, sub: i.billToCompany || i.billToName || "", deletedAt: i.deletedAt!.toISOString() })),
    ...tickets.map((t) => ({ key: `ticket:${t.id}`, type: "ticket" as const, id: t.id, name: `${t.number} · ${t.subject}`, sub: t.requesterName ?? "", deletedAt: t.deletedAt!.toISOString() })),
  ].sort((a, b) => a.deletedAt.localeCompare(b.deletedAt));

  return (
    <div>
      <PageHead title="Trash" lede="Items moved to Trash are deleted for good after 30 days. Invoices with money paid on them are never deleted." />
      <TrashList items={items} />
    </div>
  );
}

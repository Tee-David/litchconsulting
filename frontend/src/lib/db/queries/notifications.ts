import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lead, invoice } from "@/lib/db/schema";

export type NotificationItem = {
  id: string;
  type: "lead" | "invoice_sent" | "invoice_paid";
  title: string;
  description: string;
  href: string;
  at: string; // ISO timestamp
};

/** Activity feed (leads captured, invoices sent/paid) surfaced as notifications. */
export async function recentNotifications(limit = 20): Promise<NotificationItem[]> {
  const [leads, invoices] = await Promise.all([
    db.select().from(lead).orderBy(desc(lead.createdAt)).limit(15),
    db.select().from(invoice).orderBy(desc(invoice.createdAt)).limit(20),
  ]);

  const items: NotificationItem[] = [];
  for (const l of leads) {
    items.push({
      id: `lead-${l.id}`,
      type: "lead",
      title: "New lead captured",
      description: `${l.name || l.email} · ${l.source}`,
      href: "/admin/clients",
      at: (l.createdAt as Date).toISOString(),
    });
  }
  for (const inv of invoices) {
    const who = inv.billToCompany || inv.billToName || "a client";
    if (inv.paidAt) {
      items.push({
        id: `paid-${inv.id}`,
        type: "invoice_paid",
        title: `Invoice ${inv.number} paid`,
        description: who,
        href: `/admin/finance/invoices/${inv.id}`,
        at: (inv.paidAt as Date).toISOString(),
      });
    } else if (inv.sentAt) {
      items.push({
        id: `sent-${inv.id}`,
        type: "invoice_sent",
        title: `Invoice ${inv.number} sent`,
        description: who,
        href: `/admin/finance/invoices/${inv.id}`,
        at: (inv.sentAt as Date).toISOString(),
      });
    }
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return items.slice(0, limit);
}

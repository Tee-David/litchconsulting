import "server-only";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lead, invoice, ticket, ticketMessage } from "@/lib/db/schema";

export type NotificationItem = {
  id: string;
  type: "lead" | "invoice_sent" | "invoice_paid" | "ticket_created" | "ticket_replied";
  title: string;
  description: string;
  href: string;
  at: string; // ISO timestamp
};

/** Activity feed (leads captured, invoices sent/paid, tickets) surfaced as notifications. */
export async function recentNotifications(limit = 20): Promise<NotificationItem[]> {
  const [leads, invoices, tickets, replies] = await Promise.all([
    db.select().from(lead).orderBy(desc(lead.createdAt)).limit(15),
    db.select().from(invoice).orderBy(desc(invoice.createdAt)).limit(20),
    db.select().from(ticket).orderBy(desc(ticket.createdAt)).limit(15),
    db
      .select({
        msgId: ticketMessage.id,
        authorName: ticketMessage.authorName,
        createdAt: ticketMessage.createdAt,
        body: ticketMessage.body,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        ticketSubject: ticket.subject,
      })
      .from(ticketMessage)
      .innerJoin(ticket, eq(ticketMessage.ticketId, ticket.id))
      .where(eq(ticketMessage.authorRole, "client"))
      .orderBy(desc(ticketMessage.createdAt))
      .limit(15),
  ]);

  const items: NotificationItem[] = [];

  // Leads
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

  // Invoices
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

  // Support Tickets
  for (const t of tickets) {
    items.push({
      id: `ticket-created-${t.id}`,
      type: "ticket_created",
      title: `New ticket ${t.number}`,
      description: `${t.requesterName || t.requesterEmail || "Client"}: ${t.subject}`,
      href: "/admin/help-desk",
      at: (t.createdAt as Date).toISOString(),
    });
  }

  // Ticket replies from clients
  for (const r of replies) {
    // Avoid double notifying if this is the initial ticket message
    const t = tickets.find((tick) => tick.id === r.ticketId);
    const isInitial = t && Math.abs(new Date(t.createdAt).getTime() - new Date(r.createdAt).getTime()) < 5000;
    if (isInitial) continue;

    items.push({
      id: `ticket-reply-${r.msgId}`,
      type: "ticket_replied",
      title: `Reply on ${r.ticketNumber}`,
      description: `${r.authorName || "Client"}: ${r.body.slice(0, 40)}${r.body.length > 40 ? "..." : ""}`,
      href: "/admin/help-desk",
      at: (r.createdAt as Date).toISOString(),
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return items.slice(0, limit);
}

/** Activity feed for a specific client (invoices issued, paid, ticket replies from agents). */
export async function recentClientNotifications(clientId: string, limit = 20): Promise<NotificationItem[]> {
  try {
    const [invoices, replies] = await Promise.all([
      db.select().from(invoice).where(eq(invoice.clientId, clientId)).orderBy(desc(invoice.createdAt)).limit(20),
      db
        .select({
          msgId: ticketMessage.id,
          authorName: ticketMessage.authorName,
          createdAt: ticketMessage.createdAt,
          body: ticketMessage.body,
          ticketId: ticket.id,
          ticketNumber: ticket.number,
          ticketSubject: ticket.subject,
        })
        .from(ticketMessage)
        .innerJoin(ticket, eq(ticketMessage.ticketId, ticket.id))
        .where(and(eq(ticket.clientId, clientId), eq(ticketMessage.authorRole, "agent")))
        .orderBy(desc(ticketMessage.createdAt))
        .limit(15),
    ]);

    const items: NotificationItem[] = [];

    // Invoices
    for (const inv of invoices) {
      if (inv.paidAt) {
        items.push({
          id: `paid-${inv.id}`,
          type: "invoice_paid",
          title: `Invoice paid`,
          description: `Receipt for ${inv.number} is ready`,
          href: `/dashboard/invoices/${inv.id}`,
          at: (inv.paidAt as Date).toISOString(),
        });
      } else if (inv.sentAt) {
        items.push({
          id: `sent-${inv.id}`,
          type: "invoice_sent",
          title: `New invoice issued`,
          description: `Invoice ${inv.number} is due on ${inv.dueDate || "receipt"}`,
          href: `/dashboard/invoices/${inv.id}`,
          at: (inv.sentAt as Date).toISOString(),
        });
      }
    }

    // Agent replies on support tickets
    for (const r of replies) {
      items.push({
        id: `ticket-reply-${r.msgId}`,
        type: "ticket_replied",
        title: `Reply on ${r.ticketNumber}`,
        description: `Litch Consulting: ${r.body.slice(0, 40)}${r.body.length > 40 ? "..." : ""}`,
        href: `/dashboard/support/${r.ticketId}`,
        at: (r.createdAt as Date).toISOString(),
      });
    }

    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    return items.slice(0, limit);
  } catch {
    return [];
  }
}


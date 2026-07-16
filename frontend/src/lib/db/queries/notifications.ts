import "server-only";
import { desc, eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  lead,
  invoice,
  ticket,
  ticketMessage,
  serviceRequest,
  serviceRequestEvent,
  consultation,
  payment,
} from "@/lib/db/schema";

export type NotificationItem = {
  id: string;
  type:
    | "lead"
    | "invoice_sent"
    | "invoice_paid"
    | "ticket_created"
    | "ticket_replied"
    | "request"
    | "payment_flagged"
    | "consultation";
  title: string;
  description: string;
  href: string;
  at: string; // ISO timestamp
};

/** Activity feed (leads captured, invoices sent/paid, tickets) surfaced as notifications. */
export async function recentNotifications(limit = 20): Promise<NotificationItem[]> {
  const [leads, invoices, tickets, replies, requests, requestEvents, consults, flaggedPays] =
    await Promise.all([
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
      db.select().from(serviceRequest).orderBy(desc(serviceRequest.createdAt)).limit(15),
      db
        .select({
          id: serviceRequestEvent.id,
          type: serviceRequestEvent.type,
          message: serviceRequestEvent.message,
          createdAt: serviceRequestEvent.createdAt,
          requestId: serviceRequest.id,
          requestNumber: serviceRequest.number,
          serviceName: serviceRequest.serviceName,
        })
        .from(serviceRequestEvent)
        .innerJoin(serviceRequest, eq(serviceRequestEvent.requestId, serviceRequest.id))
        .where(
          inArray(serviceRequestEvent.type, [
            "payment_received",
            "document_uploaded",
            "documents_complete",
            "cancelled",
            "declined",
          ])
        )
        .orderBy(desc(serviceRequestEvent.createdAt))
        .limit(15),
      db.select().from(consultation).orderBy(desc(consultation.createdAt)).limit(10),
      db
        .select()
        .from(payment)
        .where(inArray(payment.status, ["flagged_amount_mismatch", "duplicate_success"]))
        .orderBy(desc(payment.createdAt))
        .limit(10),
    ]);

  const items: NotificationItem[] = [];

  // Service requests + their lifecycle events
  for (const r of requests) {
    items.push({
      id: `request-${r.id}`,
      type: "request",
      title: `New request ${r.number}`,
      description: `${r.serviceName} · ${r.pricingMode === "quote" ? "quote-based" : "fixed-price"}`,
      href: `/admin/requests/${r.id}`,
      at: (r.createdAt as Date).toISOString(),
    });
  }
  for (const e of requestEvents) {
    items.push({
      id: `request-event-${e.id}`,
      type: "request",
      title: `${e.requestNumber} — ${e.type.replace(/_/g, " ")}`,
      description: e.message?.slice(0, 60) || e.serviceName,
      href: `/admin/requests/${e.requestId}`,
      at: (e.createdAt as Date).toISOString(),
    });
  }

  // Consultations booked via Cal.com
  for (const c of consults) {
    items.push({
      id: `consultation-${c.id}`,
      type: "consultation",
      title: `Consultation ${c.status}`,
      description: `${c.name || c.email}${c.startsAt ? ` · ${(c.startsAt as Date).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}` : ""}`,
      href: "/admin/requests?tab=consultations",
      at: (c.createdAt as Date).toISOString(),
    });
  }

  // Payments needing attention
  for (const p of flaggedPays) {
    items.push({
      id: `payment-flag-${p.id}`,
      type: "payment_flagged",
      title:
        p.status === "duplicate_success" ? "Double payment — refund needed" : "Payment amount mismatch",
      description: `Reference ${p.reference}`,
      href: `/admin/finance/invoices/${p.invoiceId}`,
      at: (p.updatedAt as Date).toISOString(),
    });
  }

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
    const [invoices, replies, requestEvents] = await Promise.all([
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
      db
        .select({
          id: serviceRequestEvent.id,
          type: serviceRequestEvent.type,
          message: serviceRequestEvent.message,
          actorRole: serviceRequestEvent.actorRole,
          createdAt: serviceRequestEvent.createdAt,
          requestId: serviceRequest.id,
          requestNumber: serviceRequest.number,
          serviceName: serviceRequest.serviceName,
        })
        .from(serviceRequestEvent)
        .innerJoin(serviceRequest, eq(serviceRequestEvent.requestId, serviceRequest.id))
        .where(
          and(
            eq(serviceRequest.clientId, clientId),
            eq(serviceRequestEvent.visibility, "client"),
            inArray(serviceRequestEvent.type, [
              "quote_sent",
              "status_changed",
              "deliverable_uploaded",
              "payment_received",
              "refunded",
            ])
          )
        )
        .orderBy(desc(serviceRequestEvent.createdAt))
        .limit(15),
    ]);

    const items: NotificationItem[] = [];

    // Progress on their service requests (skip the client's own actions —
    // notifying someone about what they just did is noise).
    for (const e of requestEvents) {
      if (e.actorRole === "client") continue;
      items.push({
        id: `request-event-${e.id}`,
        type: "request",
        title: `${e.serviceName} update`,
        description: e.message?.slice(0, 60) || `${e.requestNumber} — ${e.type.replace(/_/g, " ")}`,
        href: `/dashboard/requests/${e.requestId}`,
        at: (e.createdAt as Date).toISOString(),
      });
    }

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


"use server";

import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client, invoice, serviceRequest } from "@/lib/db/schema";
import { isAdmin } from "@/lib/server-user";

export type CommandHit = {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  group: "Clients" | "Requests" | "Invoices";
};

/**
 * Lightweight cross-entity search for the ⌘K palette. Matches clients by
 * name/company/email, requests by number/service, invoices by number/project.
 * Admin-guarded; returns at most a handful of hits per group.
 */
export async function commandSearch(query: string): Promise<CommandHit[]> {
  if (!(await isAdmin())) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const [clients, requests, invoices] = await Promise.all([
    db
      .select({ id: client.id, name: client.name, company: client.company, email: client.email })
      .from(client)
      .where(
        sql`${client.deletedAt} IS NULL AND (${client.name} ILIKE ${like} OR ${client.company} ILIKE ${like} OR ${client.email} ILIKE ${like})`,
      )
      .orderBy(desc(client.createdAt))
      .limit(5),
    db
      .select({
        id: serviceRequest.id,
        number: serviceRequest.number,
        serviceName: serviceRequest.serviceName,
        status: serviceRequest.status,
      })
      .from(serviceRequest)
      .where(
        sql`${serviceRequest.deletedAt} IS NULL AND (${serviceRequest.number} ILIKE ${like} OR ${serviceRequest.serviceName} ILIKE ${like})`,
      )
      .orderBy(desc(serviceRequest.createdAt))
      .limit(5),
    db
      .select({
        id: invoice.id,
        number: invoice.number,
        kind: invoice.kind,
        projectTitle: invoice.projectTitle,
        billToName: invoice.billToName,
      })
      .from(invoice)
      .where(
        sql`${invoice.deletedAt} IS NULL AND (${invoice.number} ILIKE ${like} OR ${invoice.projectTitle} ILIKE ${like} OR ${invoice.billToName} ILIKE ${like})`,
      )
      .orderBy(desc(invoice.createdAt))
      .limit(5),
  ]);

  const hits: CommandHit[] = [];

  for (const c of clients) {
    hits.push({
      id: c.id,
      label: c.company || c.name,
      sublabel: c.email || undefined,
      href: `/admin/clients/${c.id}`,
      group: "Clients",
    });
  }
  for (const r of requests) {
    hits.push({
      id: r.id,
      label: `${r.number} · ${r.serviceName}`,
      sublabel: r.status,
      href: `/admin/requests/${r.id}`,
      group: "Requests",
    });
  }
  for (const inv of invoices) {
    const base = inv.kind === "quote" ? "/admin/finance/quotes" : "/admin/finance/invoices";
    hits.push({
      id: inv.id,
      label: `${inv.number}${inv.projectTitle ? ` · ${inv.projectTitle}` : ""}`,
      sublabel: inv.billToName || undefined,
      href: `${base}/${inv.id}`,
      group: "Invoices",
    });
  }

  return hits;
}

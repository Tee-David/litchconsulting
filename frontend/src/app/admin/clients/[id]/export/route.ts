import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  client,
  clientNote,
  consultation,
  invoice,
  invoiceItem,
  payment,
  requestItem,
  reviewRound,
  serviceRequest,
  serviceRequestDocument,
  serviceRequestEvent,
  ticket,
  ticketMessage,
  user,
} from "@/lib/db/schema";
import { hasAccess, getSessionUser } from "@/lib/server-user";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * NDPA data export for one client: every record we hold about them, as one
 * JSON file with an index, plus 24-hour download links for each stored file.
 * Admin-only (access area clientData); every export is audit-logged.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAccess("clientData"))) return NextResponse.json({ error: "You do not have access to export client data." }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Unknown client." }, { status: 404 });
  const [c] = await db.select().from(client).where(eq(client.id, id)).limit(1);
  if (!c) return NextResponse.json({ error: "Unknown client." }, { status: 404 });

  const reqs = await db.select().from(serviceRequest).where(eq(serviceRequest.clientId, id));
  const reqIds = reqs.map((r) => r.id);
  const invs = await db.select().from(invoice).where(eq(invoice.clientId, id));
  const invIds = invs.map((i) => i.id);
  const tks = await db.select().from(ticket).where(eq(ticket.clientId, id));
  const tkIds = tks.map((t) => t.id);
  const none = Promise.resolve([] as never[]);

  const [events, docs, items, rounds, lines, pays, messages, notes, consults, account] = await Promise.all([
    reqIds.length ? db.select().from(serviceRequestEvent).where(inArray(serviceRequestEvent.requestId, reqIds)) : none,
    reqIds.length ? db.select().from(serviceRequestDocument).where(inArray(serviceRequestDocument.requestId, reqIds)) : none,
    reqIds.length ? db.select().from(requestItem).where(inArray(requestItem.requestId, reqIds)) : none,
    reqIds.length ? db.select().from(reviewRound).where(inArray(reviewRound.requestId, reqIds)) : none,
    invIds.length ? db.select().from(invoiceItem).where(inArray(invoiceItem.invoiceId, invIds)) : none,
    db.select().from(payment).where(eq(payment.clientId, id)),
    tkIds.length ? db.select().from(ticketMessage).where(inArray(ticketMessage.ticketId, tkIds)) : none,
    db.select().from(clientNote).where(eq(clientNote.clientId, id)),
    db.select().from(consultation).where(eq(consultation.clientId, id)),
    c.userId ? db.select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }).from(user).where(eq(user.id, c.userId)) : none,
  ]);

  // 24-hour links to the stored files (private bucket).
  let files: Array<{ id: string; requestId: string; fileName: string; kind: string; sizeBytes: number; uploadedAt: Date; downloadUrl: string | null }> = [];
  try {
    const { presignPrivateGet } = await import("@/lib/r2");
    files = await Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        requestId: d.requestId,
        fileName: d.fileName,
        kind: d.kind,
        sizeBytes: d.sizeBytes,
        uploadedAt: d.createdAt,
        downloadUrl: await presignPrivateGet(d.r2Key, { downloadName: d.fileName, expiresIn: 24 * 3600 }).catch(() => null),
      })),
    );
  } catch {
    files = docs.map((d) => ({ id: d.id, requestId: d.requestId, fileName: d.fileName, kind: d.kind, sizeBytes: d.sizeBytes, uploadedAt: d.createdAt, downloadUrl: null }));
  }

  const me = await getSessionUser();
  const body = {
    index: {
      generatedAt: new Date().toISOString(),
      generatedBy: me?.name || me?.email || null,
      controller: "Litch Consulting Ltd",
      law: "Nigeria Data Protection Act 2023, right of access",
      client: c.company || c.name,
      sections: {
        profile: 1,
        portalAccount: account.length,
        requests: reqs.length,
        timeline: events.length,
        asks: items.length,
        reviewRounds: rounds.length,
        files: files.length,
        invoicesAndQuotes: invs.length,
        invoiceLines: lines.length,
        payments: pays.length,
        supportTickets: tks.length,
        supportMessages: messages.length,
        notes: notes.length,
        consultations: consults.length,
      },
      fileLinksExpire: new Date(Date.now() + 24 * 3600_000).toISOString(),
    },
    profile: c,
    portalAccount: account[0] ?? null,
    requests: reqs,
    timeline: events,
    asks: items,
    reviewRounds: rounds,
    files,
    invoicesAndQuotes: invs.map((i) => ({ ...i, items: lines.filter((l) => l.invoiceId === i.id) })),
    payments: pays.map((p) => ({ ...p, rawEvent: undefined, proofKey: undefined, accessCode: undefined, authorizationUrl: undefined })),
    supportTickets: tks.map((t) => ({ ...t, messages: messages.filter((m) => m.ticketId === t.id) })),
    notes,
    consultations: consults,
  };

  await recordAudit({ action: "client.data_exported", entity: "client", entityId: id, meta: { client: c.company || c.name, files: files.length } });

  const slug = (c.company || c.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="litch-data-export-${slug}-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}

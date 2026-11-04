import "server-only";
import { cache } from "react";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requestAssignment, requestItem, reviewRound } from "@/lib/db/schema";
import type { AttentionItem } from "@/components/kit";
import { staffRequestRows, staffThreads } from "@/lib/requests/work";

/**
 * Staff "My work": only requests assigned to the user (request_assignment),
 * never an amount. Items: what clients supplied (to check and mark received),
 * review rounds where changes were asked, new client messages, asks past due,
 * fresh assignments, and drafts waiting on the client (info).
 */

const DAY = 86_400_000;
const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" });
const ago = (d: Date | string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

export const staffAttention = cache(async (userId: string): Promise<AttentionItem[]> => {
  const rows = await staffRequestRows(userId);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const [supplied, overdue, rounds, threads, fresh] = await Promise.all([
    db.select().from(requestItem).where(and(inArray(requestItem.requestId, ids), eq(requestItem.status, "supplied"))),
    db.select().from(requestItem).where(and(inArray(requestItem.requestId, ids), eq(requestItem.status, "open"), isNotNull(requestItem.dueAt))),
    db.select().from(reviewRound).where(and(inArray(reviewRound.requestId, ids), eq(reviewRound.decision, "changes"))).orderBy(desc(reviewRound.round)),
    staffThreads(userId),
    db
      .select()
      .from(requestAssignment)
      .where(and(eq(requestAssignment.userId, userId), gte(requestAssignment.createdAt, new Date(Date.now() - 3 * DAY)))),
  ]);
  const out: AttentionItem[] = [];

  // Supplied items, grouped per request.
  const suppliedBy = new Map<string, typeof supplied>();
  for (const s of supplied) suppliedBy.set(s.requestId, [...(suppliedBy.get(s.requestId) ?? []), s]);
  for (const [rid, list] of suppliedBy) {
    const r = byId.get(rid)!;
    const latest = list.map((x) => x.suppliedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
    out.push({
      id: `supplied:${rid}`,
      group: "From clients",
      severity: 2,
      icon: "upload",
      title: `${r.client} supplied ${list.length === 1 ? `“${list[0].title}”` : `${list.length} items`}`,
      detail: `${r.number} · ${r.serviceName} · check, then mark received`,
      when: latest ? ago(latest) : undefined,
      primary: { label: "Check items", href: `/work/requests/${rid}?tab=asks` },
    });
  }

  // Changes requested on the latest round, while the work is back with us.
  const seen = new Set<string>();
  for (const rd of rounds) {
    if (seen.has(rd.requestId)) continue;
    seen.add(rd.requestId);
    const r = byId.get(rd.requestId)!;
    if (r.status !== "in_progress" || rd.round !== r.reviewRound) continue;
    const first = Array.isArray(rd.comments) ? (rd.comments as Array<{ text?: string }>)[0]?.text : undefined;
    out.push({
      id: `changes:${rd.id}`,
      group: "Reviews",
      severity: 3,
      icon: "review",
      title: `${r.client} asked for changes on draft ${rd.round}`,
      detail: `${r.number}${first ? ` · “${first.slice(0, 140)}”` : ""}`,
      when: rd.decidedAt ? ago(rd.decidedAt) : undefined,
      primary: { label: "Open request", href: `/work/requests/${r.id}?tab=deliverables` },
    });
  }

  // Client messages not yet answered.
  for (const t of threads.filter((x) => x.unanswered > 0)) {
    out.push({
      id: `msg:${t.id}:${t.lastAt}`,
      group: "From clients",
      severity: 2,
      icon: "reply",
      title: `New message from ${t.client}`,
      detail: `${t.number} · ${t.messages[t.messages.length - 1]?.body.slice(0, 140) ?? ""}`,
      when: t.lastAt ? ago(t.lastAt) : undefined,
      primary: { label: "Reply", href: `/work/conversations?r=${t.id}` },
    });
  }

  // Asks past (or near) their due date.
  for (const it of overdue) {
    const due = it.dueAt!;
    const late = due.getTime() < Date.now();
    if (!late && due.getTime() - Date.now() > 2 * DAY) continue;
    const r = byId.get(it.requestId)!;
    out.push({
      id: `due:${it.id}`,
      group: "Waiting on client",
      severity: late ? 2 : 1,
      icon: "calendar",
      title: `${r.client} has not answered “${it.title}”`,
      detail: `${r.number} · send a reminder or follow up by phone`,
      when: `${late ? "Was due" : "Due"} ${fmtDay(due)}`,
      whenTone: late ? "bad" : "warn",
      primary: { label: "Open asks", href: `/work/requests/${r.id}?tab=asks` },
    });
  }

  // Fresh assignments.
  for (const a of fresh) {
    const r = byId.get(a.requestId);
    if (!r) continue;
    out.push({
      id: `assigned:${a.id}`,
      group: "Assigned",
      severity: 1,
      icon: "assign",
      title: `You were assigned ${r.number}`,
      detail: `${r.client} · ${r.serviceName} · payment: ${r.payment}`,
      when: ago(a.createdAt),
      primary: { label: "Open request", href: `/work/requests/${r.id}` },
    });
  }

  // Drafts with the client (info only).
  for (const r of rows.filter((x) => x.status === "client_review")) {
    out.push({
      id: `with-client:${r.id}:${r.reviewRound}`,
      group: "Reviews",
      severity: 1,
      icon: "bell",
      title: `${r.client} is reviewing draft ${r.reviewRound}`,
      detail: `${r.number} · nothing to do until they decide`,
      primary: { label: "Open request", href: `/work/requests/${r.id}` },
    });
  }

  return out.sort((a, b) => b.severity - a.severity);
});

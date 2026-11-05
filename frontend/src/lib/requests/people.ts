import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client, clientMember, requestAssignment, serviceRequest, user } from "@/lib/db/schema";
import { notifyUsers, userIdsWithRole, type NotifyCategory } from "@/lib/notifications";

/**
 * Who is on a request, and "tell the firm / tell the client" helpers that fan
 * out through notifyUsers (bell + email + push, per preference).
 */

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || "https://www.litchconsulting.com").replace(/\/$/, "");
}

/** Staff user ids assigned to a request. */
export async function assigneeIds(requestId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: requestAssignment.userId })
    .from(requestAssignment)
    .where(eq(requestAssignment.requestId, requestId));
  return rows.map((r) => r.userId);
}

/** Assigned people with names (for "your team at Litch"). */
export async function assigneesOf(requestIds: string[]): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const out = new Map<string, Array<{ id: string; name: string }>>();
  if (!requestIds.length) return out;
  const rows = await db
    .select({ requestId: requestAssignment.requestId, id: user.id, name: user.name })
    .from(requestAssignment)
    .innerJoin(user, eq(user.id, requestAssignment.userId))
    .where(inArray(requestAssignment.requestId, requestIds));
  for (const r of rows) {
    const list = out.get(r.requestId) ?? [];
    list.push({ id: r.id, name: r.name });
    out.set(r.requestId, list);
  }
  return out;
}

/** The signed-in user ids of a client company (owner contact today). */
export async function clientUserIds(clientId: string): Promise<string[]> {
  const ids = new Set<string>();
  const [c] = await db.select({ userId: client.userId }).from(client).where(eq(client.id, clientId));
  if (c?.userId) ids.add(c.userId);
  // Colleagues invited to the company (lib/invitations.ts).
  const members = await db.select({ userId: clientMember.userId }).from(clientMember).where(eq(clientMember.clientId, clientId));
  for (const m of members) ids.add(m.userId);
  const reqUsers = await db
    .selectDistinct({ userId: serviceRequest.userId })
    .from(serviceRequest)
    .where(eq(serviceRequest.clientId, clientId));
  for (const r of reqUsers) if (r.userId) ids.add(r.userId);
  return [...ids];
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A short branded email: heading, one paragraph, one button. */
export async function simpleEmail(opts: { subject: string; heading: string; body: string; href: string; cta: string }) {
  const { emailLayout, emailButton } = await import("@/lib/email");
  const href = opts.href.startsWith("http") ? opts.href : `${appBaseUrl()}${opts.href}`;
  return {
    subject: opts.subject,
    html: emailLayout(
      `<p style="margin:0 0 8px;font-size:20px;font-weight:700;">${escapeHtml(opts.heading)}</p>
       <p style="margin:0 0 18px;color:#41485a;">${escapeHtml(opts.body)}</p>
       <p style="margin:0 0 12px;">${emailButton(href, opts.cta)}</p>`,
      { preheader: opts.body.slice(0, 120) },
    ),
  };
}

type Note = {
  category: NotifyCategory;
  title: string;
  body?: string;
  dedupeKey: string;
  email?: { subject: string; html: string };
};

/** Tell the people working on a request (assigned staff + every admin). */
export async function notifyFirm(requestId: string | null, note: Note & { adminLink?: string; staffLink?: string }) {
  try {
    const [admins, staff] = await Promise.all([userIdsWithRole("admin"), requestId ? assigneeIds(requestId) : Promise.resolve([])]);
    const adminLink = note.adminLink ?? (requestId ? `/admin/requests/${requestId}` : "/admin");
    const staffLink = note.staffLink ?? (requestId ? `/work/requests/${requestId}` : "/work");
    const staffOnly = staff.filter((id) => !admins.includes(id));
    await Promise.all([
      notifyUsers({ ...note, userIds: admins, link: adminLink }),
      staffOnly.length ? notifyUsers({ ...note, userIds: staffOnly, link: staffLink }) : Promise.resolve(),
    ]);
  } catch (err) {
    console.error("[notifyFirm] failed:", err);
  }
}

/** Tell the client's users. */
export async function notifyClient(clientId: string, note: Note & { link: string }) {
  try {
    const ids = await clientUserIds(clientId);
    await notifyUsers({ ...note, userIds: ids });
  } catch (err) {
    console.error("[notifyClient] failed:", err);
  }
}

import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notification, notificationPref, user } from "@/lib/db/schema";

/**
 * One event → bell + email + push, per recipient, honouring each user's
 * per-category preference (notification_pref):
 *   immediate — email and push now (each channel can be switched off)
 *   digest    — bell now; email in the daily digest (cron), no push
 *   off       — bell only (the in-app history is always kept)
 * `dedupeKey` names the event so retries never create a second bell row or a
 * second email (the outbox dedupes on the same key).
 */

export const CATEGORIES = {
  actions: { label: "Actions for you", hint: "Quotes to accept, payments due, documents or answers we need, drafts to review." },
  progress: { label: "Progress", hint: "Status changes, files received, work delivered." },
  billing: { label: "Billing", hint: "Invoices, receipts, payment confirmations." },
  support: { label: "Support", hint: "Replies to your support tickets." },
  team: { label: "Team and access", hint: "Invitations, role changes, sign-in alerts." },
} as const;
export type NotifyCategory = keyof typeof CATEGORIES;
export type NotifyMode = "immediate" | "digest" | "off";

export type Pref = { category: NotifyCategory; mode: NotifyMode; email: boolean; push: boolean };

const DEFAULT_PREF = (category: NotifyCategory): Pref => ({ category, mode: "immediate", email: true, push: true });

export async function getPrefs(userId: string): Promise<Pref[]> {
  const rows = await db.select().from(notificationPref).where(eq(notificationPref.userId, userId));
  return (Object.keys(CATEGORIES) as NotifyCategory[]).map((c) => {
    const r = rows.find((x) => x.category === c);
    return r ? { category: c, mode: r.mode as NotifyMode, email: r.email, push: r.push } : DEFAULT_PREF(c);
  });
}

export async function setPref(userId: string, pref: Pref): Promise<void> {
  if (!(pref.category in CATEGORIES)) throw new Error("Unknown category");
  if (!["immediate", "digest", "off"].includes(pref.mode)) throw new Error("Unknown mode");
  await db
    .insert(notificationPref)
    .values({ userId, category: pref.category, mode: pref.mode, email: pref.email, push: pref.push })
    .onConflictDoUpdate({
      target: [notificationPref.userId, notificationPref.category],
      set: { mode: pref.mode, email: pref.email, push: pref.push, updatedAt: new Date() },
    });
}

export type NotifyInput = {
  userIds: string[];
  category: NotifyCategory;
  title: string;
  body?: string;
  /** Absolute path inside the app, e.g. /dashboard/requests/<id>. */
  link?: string;
  dedupeKey: string;
  /** Email for this event. Omit for bell/push-only events. */
  email?: { subject: string; html: string };
};

/** Fan an event out to users. Never throws: a failed channel is logged. */
export async function notifyUsers(input: NotifyInput): Promise<void> {
  const ids = [...new Set(input.userIds.filter(Boolean))];
  if (!ids.length) return;

  try {
    await db
      .insert(notification)
      .values(
        ids.map((userId) => ({
          userId,
          category: input.category,
          title: input.title.slice(0, 200),
          body: input.body?.slice(0, 1000) ?? null,
          link: input.link ?? null,
          dedupeKey: input.dedupeKey,
        })),
      )
      .onConflictDoNothing();
  } catch (err) {
    console.error("[notify] bell insert failed:", err);
  }

  const [prefRows, users] = await Promise.all([
    db
      .select()
      .from(notificationPref)
      .where(and(inArray(notificationPref.userId, ids), eq(notificationPref.category, input.category)))
      .catch(() => []),
    db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, ids)).catch(() => []),
  ]);
  const prefOf = (id: string): Pref => {
    const r = prefRows.find((p) => p.userId === id);
    return r ? { category: input.category, mode: r.mode as NotifyMode, email: r.email, push: r.push } : DEFAULT_PREF(input.category);
  };

  const emailTo: string[] = [];
  const pushTo: string[] = [];
  for (const u of users) {
    const p = prefOf(u.id);
    if (p.mode !== "immediate") continue;
    if (p.email && input.email && u.email) emailTo.push(u.email);
    if (p.push) pushTo.push(u.id);
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.litchconsulting.com").replace(/\/$/, "");
  const tasks: Promise<unknown>[] = [];
  if (emailTo.length && input.email) {
    const { sendEmail } = await import("@/lib/email");
    for (const to of emailTo) {
      tasks.push(
        sendEmail({ to, subject: input.email.subject, html: input.email.html, dedupeKey: `${input.dedupeKey}:${to}` }).catch((e) =>
          console.error("[notify] email failed:", e),
        ),
      );
    }
  }
  if (pushTo.length) {
    const { pushToUsers } = await import("@/lib/push");
    tasks.push(
      pushToUsers(pushTo, { title: input.title, body: input.body, url: input.link ? `${base}${input.link}` : undefined }).catch((e) =>
        console.error("[notify] push failed:", e),
      ),
    );
  }
  await Promise.all(tasks);
}

/** Users with a given role (e.g. tell every admin). Banned users are skipped. */
export async function userIdsWithRole(role: "admin" | "staff"): Promise<string[]> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, role), sql`coalesce(${user.banned}, false) = false`));
  return rows.map((r) => r.id);
}

/* ────────────────────────────── the bell ────────────────────────────── */

export async function listNotifications(userId: string, opts: { limit?: number; unreadOnly?: boolean } = {}) {
  const where = opts.unreadOnly
    ? and(eq(notification.userId, userId), isNull(notification.readAt))
    : eq(notification.userId, userId);
  return db
    .select()
    .from(notification)
    .where(where)
    .orderBy(desc(notification.createdAt))
    .limit(Math.min(opts.limit ?? 30, 200));
}

export async function unreadCount(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return Number(r?.n ?? 0);
}

/** Mark some (ids) or all of a user's notifications read. Scoped to the user. */
export async function markRead(userId: string, ids?: string[]): Promise<void> {
  const scope = ids?.length
    ? and(eq(notification.userId, userId), inArray(notification.id, ids), isNull(notification.readAt))
    : and(eq(notification.userId, userId), isNull(notification.readAt));
  await db.update(notification).set({ readAt: new Date() }).where(scope);
}

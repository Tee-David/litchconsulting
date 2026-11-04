import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server-user";
import { listNotifications, markRead, unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** GET: the signed-in user's latest notifications + unread count (any role). */
export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u || u.banned) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Number(new URL(req.url).searchParams.get("limit") || 20);
  const [items, unread] = await Promise.all([listNotifications(u.id, { limit }), unreadCount(u.id)]);
  return NextResponse.json({
    unread,
    items: items.map((n) => ({
      id: n.id,
      category: n.category,
      title: n.title,
      body: n.body,
      link: n.link,
      read: Boolean(n.readAt),
      createdAt: n.createdAt,
    })),
  });
}

/** POST { ids?: string[] } — mark those (or all) read. Always scoped to the caller. */
export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u || u.banned) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let ids: string[] | undefined;
  try {
    const body = (await req.json()) as { ids?: unknown };
    if (Array.isArray(body.ids)) ids = body.ids.filter((x): x is string => typeof x === "string").slice(0, 200);
  } catch {
    /* empty body = mark all */
  }
  await markRead(u.id, ids);
  return NextResponse.json({ ok: true, unread: await unreadCount(u.id) });
}

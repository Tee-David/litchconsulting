import { NextResponse } from "next/server";
import { CATEGORIES, getPrefs, setPref, type NotifyCategory } from "@/lib/notifications";
import { verifyUnsubscribe } from "@/lib/email-templates";
import { recordAudit } from "@/lib/audit";

/**
 * One-click unsubscribe (RFC 8058). Mail apps POST here from the List-Unsubscribe
 * header with the same signed link the email footer carries. It stops that kind
 * of email only; payment and security emails always send. A GET (a person who
 * opened the link) goes to the page with the confirm button.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const c = url.searchParams.get("c") ?? "";
  const s = url.searchParams.get("s") ?? "";
  if (!(c in CATEGORIES) || !verifyUnsubscribe(u, c, s)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const prefs = await getPrefs(u);
  const cur = prefs.find((p) => p.category === c);
  await setPref(u, { category: c as NotifyCategory, mode: cur?.mode ?? "immediate", email: false, push: cur?.push ?? true });
  await recordAudit({ action: "notification.unsubscribed", entity: "user", entityId: u, actorId: u, actorName: "one-click unsubscribe", meta: { category: c } });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.redirect(new URL(`/unsubscribe?${url.searchParams.toString()}`, url.origin), 303);
}

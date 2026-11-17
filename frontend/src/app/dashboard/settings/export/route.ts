import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { getPortal } from "@/lib/requests/portal";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { buildClientExport, exportResponse } from "@/lib/privacy/export";

export const dynamic = "force-dynamic";

/**
 * "Download my data" (NDPA right of access) for the signed-in client: their own
 * company only (from the session, never from the URL). Three a day; audit-logged.
 */
export async function GET() {
  const me = await getSessionUser();
  if (!me || me.banned || roleOf(me) !== "client") return NextResponse.json({ error: "Sign in to your client account." }, { status: 401 });
  const limited = await rateLimit(`data-export:${me.id}`, { limit: 3, windowSeconds: 24 * 3600 });
  if (!limited.ok) return NextResponse.json({ error: "You downloaded your data three times today. Try again tomorrow." }, { status: 429 });
  const portal = await getPortal();
  if (!portal) return NextResponse.json({ error: "No company is linked to this account." }, { status: 404 });
  const out = await buildClientExport(portal.client.id, me.name || me.email);
  if (!out) return NextResponse.json({ error: "No company is linked to this account." }, { status: 404 });
  await recordAudit({ action: "client.data_exported", entity: "client", entityId: portal.client.id, actorId: me.id, actorName: me.name || me.email, meta: { client: out.clientName, files: out.files, by: "client" } });
  return exportResponse(out);
}

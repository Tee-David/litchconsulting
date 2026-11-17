import { NextResponse } from "next/server";
import { hasAccess, getSessionUser } from "@/lib/server-user";
import { recordAudit } from "@/lib/audit";
import { buildClientExport, exportResponse } from "@/lib/privacy/export";

export const dynamic = "force-dynamic";

/**
 * NDPA data export for one client (lib/privacy/export.ts). Admin-only (access
 * area clientData); every export is audit-logged.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAccess("clientData"))) return NextResponse.json({ error: "You do not have access to export client data." }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Unknown client." }, { status: 404 });
  const me = await getSessionUser();
  const out = await buildClientExport(id, me?.name || me?.email || null);
  if (!out) return NextResponse.json({ error: "Unknown client." }, { status: 404 });
  await recordAudit({ action: "client.data_exported", entity: "client", entityId: id, meta: { client: out.clientName, files: out.files } });
  return exportResponse(out);
}

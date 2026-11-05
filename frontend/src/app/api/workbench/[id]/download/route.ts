import { WorkbenchError, wbDownload } from "@/lib/litchai/workbench";
import { workbenchAccess } from "@/lib/workbench/server";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Download a workbook. Default = the current version through the recompute
 * gate (409 + errors when it blocks). `version=n` downloads an earlier version
 * as it was saved (history only, labelled so in the file name).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await workbenchAccess(id);
  if (!access.ok) return new Response("Not allowed", { status: access.status });
  const q = new URL(req.url).searchParams;
  const wb = q.get("wb");
  const name = (q.get("name") || "workbook").replace(/[^\w.\- ]+/g, "_").replace(/\.xlsx$/i, "").slice(0, 100);
  const version = Number(q.get("version")) || undefined;
  if (!wb) return Response.json({ error: "Choose a workbook." }, { status: 400 });
  try {
    const { bytes, gate } = await wbDownload(id, wb, version ? { version } : { verified: true });
    if (!version) {
      await recordAudit({
        action: "workbench.download",
        entity: access.row.requestId ? "request" : "workbench",
        entityId: access.row.requestId ?? id,
        meta: { conversation: id, workbook: wb, gate: gate.status },
      });
    }
    const file = version ? `${name}_v${version}.xlsx` : `${name}.xlsx`;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${file}"`,
        "X-Gate-Status": version ? "history" : gate.status,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof WorkbenchError && e.status === 409) {
      return Response.json({ error: e.message, gate: (e.detail as { gate?: unknown } | undefined)?.gate ?? null }, { status: 409 });
    }
    return Response.json({ error: e instanceof WorkbenchError ? e.message : "The analysis server did not answer." }, { status: 502 });
  }
}

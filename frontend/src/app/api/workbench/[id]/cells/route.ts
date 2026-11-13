import { WorkbenchError, wbSheet } from "@/lib/litchai/workbench";
import { workbenchAccess } from "@/lib/workbench/server";

export const runtime = "nodejs";

/** A window of one sheet for the grid (values, formulas, pending diff per cell). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await workbenchAccess(id);
  if (!access.ok) return new Response("Not allowed", { status: access.status });
  const q = new URL(req.url).searchParams;
  const wb = q.get("wb");
  const sheet = q.get("sheet");
  const int = (k: string, d: number) => Math.max(1, Math.min(1_000_000, Number(q.get(k)) || d));
  if (!wb || !sheet) return Response.json({ error: "Choose a sheet." }, { status: 400 });
  try {
    const version = Number(q.get("version")) || undefined;
    return Response.json(await wbSheet(id, wb, sheet, int("r0", 1), int("r1", 200), int("c0", 1), int("c1", 60), version));
  } catch (e) {
    const status = e instanceof WorkbenchError ? (e.status === 404 ? 404 : 502) : 502;
    return Response.json({ error: e instanceof WorkbenchError ? e.message : "The analysis server did not answer." }, { status });
  }
}

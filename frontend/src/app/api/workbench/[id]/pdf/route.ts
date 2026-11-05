import { fileForEngineDoc, workbenchAccess, PDF_TYPE } from "@/lib/workbench/server";

export const runtime = "nodejs";

/**
 * The original PDF behind an extracted workbook, shown inline beside the grid
 * (the browser's own viewer; `#page=n` jumps to a source page). Same access
 * rule as the workbench; the file never leaves our private bucket otherwise.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await workbenchAccess(id);
  if (!access.ok) return new Response("Not allowed", { status: access.status });
  const doc = Number(new URL(req.url).searchParams.get("doc"));
  if (!access.row.requestId || !doc) return new Response("Not found", { status: 404 });
  const file = await fileForEngineDoc(access.row.requestId, doc);
  if (!file || !PDF_TYPE.test(file.fileName)) return new Response("Not found", { status: 404 });
  const { getPrivateObject } = await import("@/lib/r2");
  try {
    const bytes = await getPrivateObject(file.r2Key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${file.fileName.replace(/["\\]/g, "")}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("The file could not be read.", { status: 502 });
  }
}

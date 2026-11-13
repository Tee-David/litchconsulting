import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { Activity, PlugZap, Plus, Table2 } from "lucide-react";
import { conversationsFor } from "@/lib/workbench/server";
import { db } from "@/lib/db/client";
import { client, serviceRequest, serviceRequestDocument } from "@/lib/db/schema";
import { PageHead, Panel } from "@/components/admin/ui/surface";
import { AnalysesTable, type AnalysisRow } from "@/components/admin/analyses/analyses-table";
import { listDocuments, type LitchaiDocument } from "@/lib/litchai/client";

export const dynamic = "force-dynamic";

/** Owner id for files uploaded straight into a workbench (see /api/workbench/upload). */
const FIRM_OWNER = "00000000-0000-4000-8000-000000000001";

/**
 * AI Studio — cross-client overview of every LitchAI analysis, grouped by
 * client (names resolved from our client table; the backend only knows ids),
 * with deep links back to the service requests that spawned them.
 *
 * Never a dead-end: when the backend/tunnel isn't reachable the studio still
 * renders from our own relay records (cached statuses) with a "not connected"
 * notice, and the welcome workbench shows when nothing has been analyzed yet.
 */
export default async function LitchaiStudioPage({ searchParams }: { searchParams: Promise<{ requestId?: string }> }) {
  // "Open in workbench" from a request lands on the workbench start page.
  const { requestId } = await searchParams;
  if (requestId && /^[0-9a-f-]{36}$/i.test(requestId)) redirect(`/admin/analyses/w/new?requestId=${requestId}`);
  const recent = await conversationsFor("all", 8).catch(() => []);
  const configured = Boolean(process.env.LITCHAI_API_URL);
  let documents: LitchaiDocument[] = [];
  let backendError: string | null = null;
  if (configured) {
    try {
      documents = (await listDocuments()).documents;
    } catch (e) {
      backendError = e instanceof Error ? e.message : "LitchAI backend unreachable";
    }
  }

  // Our side of the fence: relayed request documents (works without the backend).
  const linkedDocs = await db
    .select({
      litchaiDocumentId: serviceRequestDocument.litchaiDocumentId,
      litchaiStatus: serviceRequestDocument.litchaiStatus,
      fileName: serviceRequestDocument.fileName,
      createdAt: serviceRequestDocument.createdAt,
      requestId: serviceRequest.id,
      requestNumber: serviceRequest.number,
      clientId: serviceRequest.clientId,
    })
    .from(serviceRequestDocument)
    .innerJoin(serviceRequest, eq(serviceRequestDocument.requestId, serviceRequest.id))
    .where(isNotNull(serviceRequestDocument.litchaiDocumentId));

  // Backend offline → synthesize the document list from our cached relay rows.
  if (documents.length === 0 && linkedDocs.length > 0) {
    documents = linkedDocs.map((d) => ({
      document_id: Number(d.litchaiDocumentId),
      client_id: d.clientId,
      filename: d.fileName,
      mime: "",
      status: d.litchaiStatus || "queued",
      progress: {},
      created_at: (d.createdAt as Date).toISOString(),
    }));
  }

  // Client names (the engine only knows ids) and the request each file came from.
  const clientIds = [...new Set(documents.map((d) => d.client_id))].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const clients = clientIds.length
    ? await db.select({ id: client.id, name: client.name, company: client.company }).from(client).where(inArray(client.id, clientIds))
    : [];
  const nameById = new Map(clients.map((c) => [c.id, c.company || c.name]));
  const requestByDoc = new Map(linkedDocs.filter((l) => l.litchaiDocumentId).map((l) => [l.litchaiDocumentId!, { id: l.requestId, number: l.requestNumber }]));
  const rows: AnalysisRow[] = documents.map((d) => {
    const pr = (d.progress ?? {}) as Record<string, unknown>;
    return {
      id: d.document_id,
      fileName: d.filename,
      status: d.status,
      reason: String(pr.reason ?? ""),
      rows: typeof pr.rows === "number" ? pr.rows : null,
      needsReview: Number(pr.needs_review ?? 0) || 0,
      clientName: nameById.get(d.client_id) ?? (d.client_id === FIRM_OWNER ? "Litch (uploaded directly)" : "Unknown client"),
      request: requestByDoc.get(String(d.document_id)) ?? null,
      createdAt: d.created_at,
    };
  });

  return (
    <div>
      <PageHead
        title="Analyses"
        lede="Open a client's files in the workbench with Sage beside the grid, and see every file the AI has read."
        actions={
          <>
            <Link href="/admin/analyses/observability" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-ctl border border-hairline bg-paper px-3.5 text-sm font-medium text-ink outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40">
              <Activity className="size-4" aria-hidden /> AI health
            </Link>
            <Link href="/admin/analyses/w/new" className="keep-brand inline-flex min-h-[40px] items-center gap-1.5 rounded-ctl bg-brand px-3.5 text-sm font-semibold text-white outline-none hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-accent/40">
              <Plus className="size-4" aria-hidden /> New analysis
            </Link>
          </>
        }
      />

      {(!configured || backendError) && (
        <div role="status" className="mb-5 flex items-start gap-3 rounded-card border border-hairline bg-warn-soft p-4">
          <PlugZap className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-ink">{configured ? "The AI server did not answer" : "The AI server is not connected yet"}</p>
            <p className="mt-0.5 text-body">
              {configured ? "The list shows the last saved statuses. Try again in a minute." : "The list shows the last saved statuses."}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-5">
        <Panel
          title="Recent workbenches"
          action={<Link href="/admin/analyses/w/new" className="text-sm font-medium text-accent hover:underline">New analysis</Link>}
          bodyClassName="p-0"
        >
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-body">
              No workbenches yet. Select <b>New analysis</b> and upload a file, or open one from a request (Work on the files, then Open in workbench).
            </p>
          ) : (
            <ul className="grid divide-y divide-hairline sm:grid-cols-2 sm:divide-y-0">
              {recent.map((c) => (
                <li key={c.id} className="sm:border-b sm:border-hairline sm:odd:border-r">
                  <Link href={`/admin/analyses/w/${c.id}`} className="flex min-h-[52px] items-center gap-3 px-4 py-3 text-sm hover:bg-surface sm:px-5">
                    <Table2 className="size-4 shrink-0 text-good" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.title}</span>
                    <span className="shrink-0 text-[12px] text-muted">{(c.updatedAt as Date).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short" })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div data-tour="analyses-studio">
          <h2 className="mb-3 font-display text-[15px] font-semibold text-ink">Files the AI has read</h2>
          <AnalysesTable rows={rows} />
        </div>
      </div>
    </div>
  );
}

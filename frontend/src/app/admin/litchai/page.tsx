import Link from "next/link";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { Activity, PlugZap } from "lucide-react";
import { db } from "@/lib/db/client";
import { client, serviceRequest, serviceRequestDocument } from "@/lib/db/schema";
import { PageHeader } from "@/components/admin/ui/page-header";
import { StudioShell, type StudioClientGroup } from "@/components/admin/litchai/studio-shell";
import { listDocuments, type LitchaiDocument } from "@/lib/litchai/client";

export const dynamic = "force-dynamic";

/**
 * AI Studio — cross-client overview of every LitchAI analysis, grouped by
 * client (names resolved from our client table; the backend only knows ids),
 * with deep links back to the service requests that spawned them.
 *
 * Never a dead-end: when the backend/tunnel isn't reachable the studio still
 * renders from our own relay records (cached statuses) with a "not connected"
 * notice, and the welcome workbench shows when nothing has been analyzed yet.
 */
export default async function LitchaiStudioPage() {
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

  let groups: StudioClientGroup[] = [];
  if (documents.length > 0) {
    const clientIds = [...new Set(documents.map((d) => d.client_id))];
    const clients = await db
      .select({ id: client.id, name: client.name, company: client.company })
      .from(client)
      .where(inArray(client.id, clientIds));
    const nameById = new Map(clients.map((c) => [c.id, c.company || c.name]));
    const byClient = new Map<string, LitchaiDocument[]>();
    for (const d of documents) {
      const list = byClient.get(d.client_id) ?? [];
      list.push(d);
      byClient.set(d.client_id, list);
    }
    groups = [...byClient.entries()]
      .map(([clientId, docs]) => ({
        clientId,
        clientName: nameById.get(clientId) ?? "Unknown client",
        documents: docs,
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  }

  const requestLinks = Object.fromEntries(
    linkedDocs
      .filter((l) => l.litchaiDocumentId)
      .map((l) => [l.litchaiDocumentId!, { requestId: l.requestId, requestNumber: l.requestNumber }])
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Studio"
        description="Client documents compiled into formula-driven workbooks — analyses, review queues, and pipeline health in one place."
      >
        <Link
          href="/admin/litchai/observability"
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-body hover:bg-cloud"
        >
          <Activity className="size-4" /> Observability
        </Link>
      </PageHeader>

      {(!configured || backendError) && (
        <div className="flex items-start gap-3 rounded-card border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <PlugZap className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-semibold text-ink">
              {configured ? "LitchAI backend unreachable" : "LitchAI backend not connected yet"}
            </p>
            <p className="mt-0.5 text-body">
              {configured
                ? `${backendError} — showing cached statuses from relayed documents.`
                : "Set LITCHAI_API_URL (+ the Cloudflare Access service-token vars) once the tunnel is live. Everything below still works — statuses shown are the last synced values."}
            </p>
          </div>
        </div>
      )}

      <StudioShell groups={groups} requestLinks={requestLinks} />
    </div>
  );
}

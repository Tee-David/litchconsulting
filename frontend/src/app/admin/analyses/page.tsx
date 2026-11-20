import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { Activity, PlugZap, Plus } from "lucide-react";
import { db } from "@/lib/db/client";
import { client, serviceRequest, serviceRequestDocument, workbenchConversation } from "@/lib/db/schema";
import { requireArea } from "@/lib/server-user";
import { PageHead } from "@/components/admin/ui/surface";
import { QueryTabs } from "@/components/admin/ui/tabs";
import { AnalysesTable, type AnalysisRow } from "@/components/admin/analyses/analyses-table";
import { WorkbenchList, type WorkbenchRow } from "@/components/admin/analyses/workbench-list";
import { listDocuments, type LitchaiDocument } from "@/lib/litchai/client";
import { wbListAll } from "@/lib/litchai/workbench";

export const dynamic = "force-dynamic";

/** Owner id for files uploaded straight into a workbench (see /api/workbench/upload). */
const FIRM_OWNER = "00000000-0000-4000-8000-000000000001";

/**
 * Analyses (v7): the workbenches first (search names, files and chats; filter, sort,
 * the 5 most recent, then Show more; rename and move to Trash), and the files the AI
 * has read on a second tab. Never a dead end: when the analysis server does not
 * answer, both lists show what this app knows, with a notice.
 */
export default async function AnalysesPage({ searchParams }: { searchParams: Promise<{ requestId?: string; tab?: string }> }) {
  const user = await requireArea("analyses", "/admin/analyses");
  const { requestId, tab } = await searchParams;
  // "Open in workbench" from a request lands on the workbench start page.
  if (requestId && /^[0-9a-f-]{36}$/i.test(requestId)) redirect(`/admin/analyses/w/new?requestId=${requestId}`);
  const configured = Boolean(process.env.LITCHAI_API_URL);
  const filesTab = tab === "files";

  let engineDown = !configured;
  let body: React.ReactNode;
  if (!filesTab) {
    const rows = await db
      .select({
        id: workbenchConversation.id,
        title: workbenchConversation.title,
        practice: workbenchConversation.practice,
        createdBy: workbenchConversation.createdBy,
        createdAt: workbenchConversation.createdAt,
        updatedAt: workbenchConversation.updatedAt,
        requestId: workbenchConversation.requestId,
        requestNumber: serviceRequest.number,
        clientName: client.name,
        clientCompany: client.company,
      })
      .from(workbenchConversation)
      .leftJoin(serviceRequest, eq(serviceRequest.id, workbenchConversation.requestId))
      .leftJoin(client, eq(client.id, workbenchConversation.clientId))
      .where(
        and(
          isNull(workbenchConversation.deletedAt),
          // a practice workbook is private to the person who made it
          or(eq(workbenchConversation.practice, false), eq(workbenchConversation.createdBy, user.id)),
        ),
      )
      .orderBy(desc(workbenchConversation.updatedAt))
      .limit(500);
    let files = new Map<string, number>();
    if (configured) {
      try {
        files = new Map((await wbListAll(200)).conversations.map((c) => [c.id, c.workbooks.length]));
      } catch {
        engineDown = true;
      }
    }
    const list: WorkbenchRow[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.practice ? "practice" : r.requestId ? "request" : "firm",
      files: files.get(r.id) ?? null,
      request: r.requestNumber ?? null,
      client: r.clientCompany || r.clientName || null,
      createdAt: (r.createdAt as Date).toISOString(),
      updatedAt: (r.updatedAt as Date).toISOString(),
      mine: r.createdBy === user.id,
    }));
    body = <WorkbenchList rows={list} canSearch={configured && !engineDown} />;
  } else {
    body = await filesBody(configured).then(([node, down]) => {
      engineDown = engineDown || down;
      return node;
    });
  }

  return (
    <div>
      <PageHead
        title="Analyses"
        lede="Open a client's files in a workbench with Sage beside the sheet. Find any earlier workbench by its name, its files or what was said in its chats."
        actions={
          <>
            <Link href="/admin/analyses/observability" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-ctl border border-hairline bg-paper px-3.5 text-sm font-medium text-ink outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40">
              <Activity className="size-4" aria-hidden /> AI health
            </Link>
            <Link href="/admin/analyses/w/new" data-tour="analyses-new" className="keep-brand inline-flex min-h-[44px] items-center gap-1.5 rounded-ctl bg-brand px-3.5 text-sm font-semibold text-white outline-none hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-accent/40">
              <Plus className="size-4" aria-hidden /> New analysis
            </Link>
          </>
        }
      />

      {engineDown ? (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-card border border-hairline bg-warn-soft p-4">
          <PlugZap className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-ink">{configured ? "The analysis server did not answer" : "The analysis server is not connected yet"}</p>
            <p className="mt-0.5 text-body">The lists show what this app has saved. Search of files and chats, and file counts, come back when the server answers.</p>
          </div>
        </div>
      ) : null}

      <div className="mb-4">
        <QueryTabs
          defaultValue="workbenches"
          tabs={[
            { label: "Workbenches", value: "workbenches" },
            { label: "Files the AI has read", value: "files" },
          ]}
        />
      </div>
      <div data-tour={filesTab ? "analyses-studio" : "analyses-recent"}>{body}</div>
    </div>
  );
}

/** The second tab: every file the analysis server has read, by client and request. */
async function filesBody(configured: boolean): Promise<[React.ReactNode, boolean]> {
  let documents: LitchaiDocument[] = [];
  let down = false;
  if (configured) {
    try {
      documents = (await listDocuments()).documents;
    } catch {
      down = true;
    }
  }
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
  // Server offline: build the list from the statuses saved here.
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
  return [<AnalysesTable key="files" rows={rows} />, down];
}

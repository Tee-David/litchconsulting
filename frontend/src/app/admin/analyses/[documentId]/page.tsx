import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, PlugZap, Table2 } from "lucide-react";
import { db } from "@/lib/db/client";
import { serviceRequest, serviceRequestDocument } from "@/lib/db/schema";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { ReviewGrid } from "@/components/admin/analyses/review-grid";
import { EngagementPanel } from "@/components/admin/analyses/engagement-panel";
import { WorkbookCompiler } from "@/components/admin/analyses/workbook-compiler";
import { ReviewStatusBanner } from "@/components/admin/analyses/review-status-banner";
import { getReview, getTaxonomy, type ReviewData, type TaxonomyCategory } from "@/lib/litchai/client";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const id = Number(documentId);

  let review: ReviewData | null = null;
  let categories: TaxonomyCategory[] = [];
  let error: string | null = null;
  try {
    const [r, t] = await Promise.all([getReview(id), getTaxonomy()]);
    review = r;
    categories = t.categories;
  } catch (e) {
    error = e instanceof Error ? e.message : "LitchAI backend unreachable";
  }

  // Bridge the two document-id spaces: the review workspace is keyed on the
  // backend numeric id; the spreadsheet editor is keyed on our service-request
  // document. The relay stored litchaiDocumentId, so this join re-links them and
  // also gives us the client id when the backend hasn't surfaced it yet.
  let editorLink: { requestId: string; docId: string } | null = null;
  let joinedClientId = "";
  if (review) {
    const [link] = await db
      .select({
        docId: serviceRequestDocument.id,
        requestId: serviceRequestDocument.requestId,
        clientId: serviceRequest.clientId,
      })
      .from(serviceRequestDocument)
      .innerJoin(serviceRequest, eq(serviceRequestDocument.requestId, serviceRequest.id))
      .where(eq(serviceRequestDocument.litchaiDocumentId, String(id)))
      .limit(1);
    if (link) {
      editorLink = { requestId: link.requestId, docId: link.docId };
      joinedClientId = link.clientId;
    }
  }

  const clientId = review?.document.client_id || joinedClientId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/analyses"
          className="inline-flex items-center gap-1 text-sm text-body hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to Analyses
        </Link>
        {editorLink && (
          <Link
            href={`/admin/analyses/editor?requestId=${editorLink.requestId}&documentId=${editorLink.docId}&back=${id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-1.5 text-xs font-semibold text-body transition-colors hover:border-brand/40 hover:bg-surface"
          >
            <Table2 className="size-3.5 text-brand" /> Open in editor
          </Link>
        )}
      </div>

      {!review ? (
        <EmptyState
          icon={PlugZap}
          title="Review workspace unavailable"
          description={
            error ||
            "The LitchAI backend isn't reachable — check LITCHAI_API_URL and the Cloudflare tunnel, then reload."
          }
        />
      ) : (
        <>
          <PageHeader
            title={review.document.filename}
            description="Risk-ordered — biggest, least-certain lines first"
          />

          <ReviewStatusBanner
            documentId={id}
            initialStatus={review.document.status}
            retryTarget={editorLink}
          />

          <WorkbookCompiler
            documentId={id}
            clientId={clientId}
            engagementId={review.document.engagement_id}
          />

          {review.document.engagement_id !== null && (
            <EngagementPanel documentId={id} engagementId={review.document.engagement_id} />
          )}

          <ReviewGrid
            documentId={id}
            lineItems={review.line_items}
            queue={review.queue}
            lineage={review.lineage}
            categories={categories}
          />
        </>
      )}
    </div>
  );
}

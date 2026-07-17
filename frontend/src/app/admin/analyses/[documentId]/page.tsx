import Link from "next/link";
import { ArrowLeft, PlugZap } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { ReviewGrid } from "@/components/admin/analyses/review-grid";
import { EngagementPanel } from "@/components/admin/analyses/engagement-panel";
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

  return (
    <div className="space-y-6">
      <Link
        href="/admin/analyses"
        className="inline-flex items-center gap-1 text-sm text-body hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Back to Analyses
      </Link>

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
            description={`Status: ${review.document.status} · risk-ordered — biggest, least-certain lines first`}
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

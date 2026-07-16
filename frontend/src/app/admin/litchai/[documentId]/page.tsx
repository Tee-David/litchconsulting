import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ReviewGrid } from "@/components/admin/litchai/review-grid";
import { EngagementPanel } from "@/components/admin/litchai/engagement-panel";
import { getReview, getTaxonomy } from "@/lib/litchai/client";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const id = Number(documentId);
  const [review, taxonomy] = await Promise.all([getReview(id), getTaxonomy()]);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/litchai"
        className="inline-flex items-center gap-1 text-sm text-body hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Back to documents
      </Link>

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
        categories={taxonomy.categories}
      />
    </div>
  );
}

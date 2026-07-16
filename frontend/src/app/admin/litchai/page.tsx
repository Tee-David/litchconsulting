import Link from "next/link";
import { Bot, Activity } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { DocumentList } from "@/components/admin/litchai/document-list";
import { listDocuments, type LitchaiDocument } from "@/lib/litchai/client";

export const dynamic = "force-dynamic";

export default async function LitchaiPage() {
  let documents: LitchaiDocument[] = [];
  let error: string | null = null;
  try {
    documents = (await listDocuments()).documents;
  } catch (e) {
    error = e instanceof Error ? e.message : "LitchAI backend unreachable";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="LitchAI"
        description="Client documents compiled into formula-driven workbooks, awaiting your review."
      >
        <Link
          href="/admin/litchai/observability"
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-body hover:bg-cloud"
        >
          <Activity className="size-4" /> Observability
        </Link>
      </PageHeader>

      {error ? (
        <EmptyState icon={Bot} title="Backend unreachable" description={error} />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No documents yet"
          description="Documents uploaded for a client are scanned, extracted and categorized here, then queued for review."
        />
      ) : (
        <DocumentList documents={documents} />
      )}
    </div>
  );
}

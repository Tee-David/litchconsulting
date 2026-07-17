import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { db } from "@/lib/db/client";
import { serviceRequest, serviceRequestDocument } from "@/lib/db/schema";
import { isAdmin } from "@/lib/server-user";
import { presignPrivateGet, r2PrivateConfigured } from "@/lib/r2";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { WorkbookEditor } from "@/components/admin/analyses/workbook-editor";

export const dynamic = "force-dynamic";

/**
 * In-browser spreadsheet workspace for a request document (client upload or
 * deliverable). The file streams straight from the private bucket via a
 * short-lived presigned URL — nothing is cached publicly. Edits here are for
 * exploration/correction spotting: the VERIFIED deliverable always comes from
 * the LitchAI compiler (publish from the request's AI panel); a manually
 * edited file goes through the regular deliverable upload and is marked
 * unverified.
 */
export default async function WorkbookEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string; documentId?: string }>;
}) {
  if (!(await isAdmin())) redirect("/dashboard");
  const { requestId, documentId } = await searchParams;
  if (!requestId || !documentId) notFound();

  const [doc] = await db
    .select()
    .from(serviceRequestDocument)
    .where(
      and(
        eq(serviceRequestDocument.id, documentId),
        eq(serviceRequestDocument.requestId, requestId)
      )
    );
  const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, requestId));
  if (!doc || !req) notFound();

  if (!r2PrivateConfigured) {
    return (
      <div className="space-y-6">
        <PageHeader title="Spreadsheet workspace" />
        <EmptyState
          icon={ShieldAlert}
          title="Private storage not configured"
          description="Set R2_PRIVATE_BUCKET to open request documents in the editor."
        />
      </div>
    );
  }

  // 10 minutes: enough for a review session, short enough to stay private.
  const src = await presignPrivateGet(doc.r2Key, { downloadName: doc.fileName, expiresIn: 600 });

  return (
    <div className="space-y-5">
      <Link
        href={`/admin/requests/${req.id}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> {req.number}
      </Link>
      <PageHeader
        title={doc.fileName}
        description={`${req.serviceName} · ${
          doc.kind === "deliverable" ? "deliverable" : "client upload"
        } — edits here are a working copy; publish verified output from the request's AI panel.`}
      />
      <WorkbookEditor src={src} fileName={doc.fileName} />
    </div>
  );
}

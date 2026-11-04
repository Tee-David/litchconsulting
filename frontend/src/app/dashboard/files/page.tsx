import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderClosed, Plus, RotateCcw } from "lucide-react";
import { EmptyState, StatusChip } from "@/components/kit";
import { PageHead, Panel, linkBtn } from "@/components/dashboard/ui";
import { FileLink } from "@/components/dashboard/file-link";
import { getPortal, clientFiles, clientRequestRows } from "@/lib/requests/portal";
import { formatDate } from "@/lib/format-date";

export const metadata: Metadata = { title: "Files" };
export const dynamic = "force-dynamic";

/** Every file, grouped by request, with Request again / Add a service on each. */
export default async function FilesPage() {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/files");
  const [files, requests] = await Promise.all([clientFiles(portal.client.id), clientRequestRows(portal.client.id)]);
  const withFiles = requests.filter((r) => files.some((f) => f.requestId === r.id));
  const lastDone = requests.find((r) => r.status === "completed");

  return (
    <div>
      <PageHead
        title="Files"
        lede="Everything we delivered, and everything you sent us, by request."
        actions={
          lastDone ? (
            <Link href={`/dashboard/requests/new?from=${lastDone.id}`} className={linkBtn.primary} data-tour="request-again">
              <RotateCcw className="size-4" aria-hidden /> Request {lastDone.serviceName} again
            </Link>
          ) : null
        }
      />
      {withFiles.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<FolderClosed />}
            title="No files yet"
            why="Files you upload on a request, and the drafts and final files we send, collect here."
            action={<Link href="/dashboard/requests/new" className={linkBtn.primary}>Request a service</Link>}
          />
        </Panel>
      ) : (
        <div className="space-y-6">
          {withFiles.map((r) => {
            const mine = files.filter((f) => f.requestId === r.id);
            const fromUs = mine.filter((f) => f.kind === "deliverable");
            const yours = mine.filter((f) => f.kind !== "deliverable");
            const closed = ["completed", "cancelled", "declined", "refunded"].includes(r.status);
            return (
              <Panel
                key={r.id}
                title={r.serviceName}
                sub={r.number}
                right={<StatusChip domain="request" status={r.status} audience="client" size="sm" />}
              >
                {fromUs.length ? (
                  <>
                    <p className="mb-2 text-sm font-medium text-ink">From us</p>
                    <ul className="mb-4 grid gap-2 md:grid-cols-2">
                      {fromUs.map((f) => (
                        <li key={f.id}>
                          <FileLink
                            href={`/api/dashboard/files/${f.id}`}
                            name={f.fileName}
                            meta={`${f.stage === "draft" ? "Draft, not final" : "Final"} · ${formatDate(f.createdAt)}`}
                            chip={f.stage === "draft" ? <StatusChip domain="deliverable" status="draft" audience="client" size="sm" /> : null}
                            blocked={f.scanStatus === "infected"}
                          />
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {yours.length ? (
                  <>
                    <p className="mb-2 text-sm font-medium text-ink">From you</p>
                    <ul className="grid gap-2 md:grid-cols-2">
                      {yours.map((f) => (
                        <li key={f.id}>
                          <FileLink href={`/api/dashboard/files/${f.id}`} name={f.fileName} meta={formatDate(f.createdAt)} blocked={f.scanStatus === "infected"} />
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
                  {closed ? (
                    <Link href={`/dashboard/requests/new?from=${r.id}`} className={linkBtn.small}>
                      <RotateCcw className="size-3.5" aria-hidden /> Request again
                    </Link>
                  ) : null}
                  <Link href={`/dashboard/requests/new?from=${r.id}&add=1`} className={linkBtn.small}>
                    <Plus className="size-3.5" aria-hidden /> Add a service
                  </Link>
                  <Link href={`/dashboard/requests/${r.id}`} className={linkBtn.ghost}>
                    Open request
                  </Link>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

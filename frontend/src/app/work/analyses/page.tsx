import type { Metadata } from "next";
import Link from "next/link";
import { FolderClosed } from "lucide-react";
import { EmptyState, StatusChip } from "@/components/kit";
import { PageHead, Panel, Callout, linkBtn } from "@/components/dashboard/ui";
import { FileLink } from "@/components/dashboard/file-link";
import { requireArea } from "@/lib/server-user";
import { staffFiles } from "@/lib/requests/work";
import { formatDate } from "@/lib/format-date";
import { conversationsFor } from "@/lib/workbench/server";

export const metadata: Metadata = { title: "Files" };
export const dynamic = "force-dynamic";

/**
 * Files on the staff member's assigned requests, each request with "Open in
 * workbench" (the same co-pilot workbench as admins, limited to assigned
 * requests by canWorkOnRequest) and its recent workbench threads.
 */
export default async function StaffFilesPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const user = await requireArea("analyses", "/work/analyses");
  const { r } = await searchParams;
  const all = await staffFiles(user.id);
  const files = r ? all.filter((f) => f.requestId === r) : all;
  const byRequest = new Map<string, typeof files>();
  for (const f of files) byRequest.set(f.requestId, [...(byRequest.get(f.requestId) ?? []), f]);
  const threads = await conversationsFor([...byRequest.keys()], 60).catch(() => []);
  const threadsBy = new Map<string, typeof threads>();
  for (const t of threads) if (t.requestId) threadsBy.set(t.requestId, [...(threadsBy.get(t.requestId) ?? []), t]);

  return (
    <div>
      <PageHead title="Files" lede="Every file on the requests assigned to you. Open them in the workbench to work with Sage beside the grid." />
      <div className="mb-6">
        <Callout tone="info" title="Work on the files with Sage">
          Open a request&rsquo;s spreadsheets and PDFs in the workbench. Sage reads every sheet first, proposes changes as a diff, and nothing in a file changes until you accept.
        </Callout>
      </div>
      {r ? (
        <Link href="/work/analyses" className={`${linkBtn.ghost} mb-4`}>Show files from all my requests</Link>
      ) : null}
      {byRequest.size === 0 ? (
        <Panel>
          <EmptyState icon={<FolderClosed />} title="No files yet" why="Files appear here when a client uploads to a request assigned to you, or when you add a draft." />
        </Panel>
      ) : (
        <div className="space-y-6">
          {[...byRequest.entries()].map(([rid, list]) => (
            <Panel
              key={rid}
              title={list[0].clientCompany || list[0].clientName || "Client"}
              sub={`${list[0].number} · ${list[0].serviceName}`}
              right={
                <span className="flex flex-wrap gap-1.5">
                  <Link href={`/work/analyses/w/new?requestId=${rid}`} className={linkBtn.primary}>Open in workbench</Link>
                  <Link href={`/work/requests/${rid}?tab=deliverables`} className={linkBtn.ghost}>Open request</Link>
                </span>
              }
            >
              {threadsBy.get(rid)?.length ? (
                <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Workbench threads">
                  {threadsBy.get(rid)!.slice(0, 4).map((t) => (
                    <li key={t.id}>
                      <Link href={`/work/analyses/w/${t.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[12.5px] text-ink hover:bg-cloud">
                        Workbench · {(t.updatedAt as Date).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short" })}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="grid gap-2 md:grid-cols-2">
                {list.map((f) => (
                  <li key={f.id}>
                    <FileLink
                      href={`/work/files/${f.id}`}
                      name={f.fileName}
                      meta={`${f.kind === "deliverable" ? (f.stage === "final" ? "Final" : "Draft") : "From client"} · ${formatDate(f.createdAt)}`}
                      chip={f.kind === "deliverable" ? <StatusChip domain="deliverable" status={f.stage === "final" ? "final" : "draft"} size="sm" /> : null}
                    />
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

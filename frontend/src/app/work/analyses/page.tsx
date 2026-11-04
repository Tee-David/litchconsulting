import type { Metadata } from "next";
import Link from "next/link";
import { FolderClosed } from "lucide-react";
import { EmptyState, StatusChip } from "@/components/kit";
import { PageHead, Panel, Callout, linkBtn } from "@/components/dashboard/ui";
import { FileLink } from "@/components/dashboard/file-link";
import { requireArea } from "@/lib/server-user";
import { staffFiles } from "@/lib/requests/work";
import { formatDate } from "@/lib/format-date";

export const metadata: Metadata = { title: "Files" };
export const dynamic = "force-dynamic";

/**
 * Files on the staff member's assigned requests. The workbench editor lives
 * under /admin (admins only) today; staff get their files here.
 * TODO(redesign:workbench): link each file into the staff-scoped workbench
 * once it accepts staff (filtered by canWorkOnRequest).
 */
export default async function StaffFilesPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const user = await requireArea("analyses", "/work/analyses");
  const { r } = await searchParams;
  const all = await staffFiles(user.id);
  const files = r ? all.filter((f) => f.requestId === r) : all;
  const byRequest = new Map<string, typeof files>();
  for (const f of files) byRequest.set(f.requestId, [...(byRequest.get(f.requestId) ?? []), f]);

  return (
    <div>
      <PageHead title="Files" lede="Every file on the requests assigned to you: what clients sent and what we drafted." />
      <div className="mb-6">
        <Callout tone="info" title="The workbench is coming to this view">
          {user.role === "admin" ? (
            <>As an admin you can open files in the workbench from <Link className="font-medium text-accent underline" href="/admin/analyses">Analyses</Link>.</>
          ) : (
            <>For now, download a file to work on it, then upload the result on the request under Deliverables.</>
          )}
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
              right={<Link href={`/work/requests/${rid}?tab=deliverables`} className={linkBtn.ghost}>Open request</Link>}
            >
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

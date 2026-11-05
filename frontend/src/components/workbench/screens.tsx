import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet, Lock, PlugZap } from "lucide-react";
import { EmptyState } from "@/components/kit";
import { wbFirstLook, wbGet, type WbConversation, type WbFirstLook } from "@/lib/litchai/workbench";
import { conversationsFor, PDF_TYPE, requestContext, requestFiles, workbenchAccess } from "@/lib/workbench/server";
import { canWorkOnRequest } from "@/lib/server-user";
import { Workbench } from "./workbench";
import { StartForm } from "./start-form";

export type Base = "/admin" | "/work";
const requestHref = (base: Base, id: string) => (base === "/admin" ? `/admin/requests/${id}` : `/work/requests/${id}`);

/** /admin/analyses/w/[id] and /work/analyses/w/[id]. */
export async function WorkbenchScreen({ id, base }: { id: string; base: Base }) {
  const access = await workbenchAccess(id);
  if (!access.ok) {
    if (access.status === 404) notFound();
    return (
      <EmptyState
        icon={<Lock />}
        title="You can't open this workbench"
        why="It works on a request that isn't assigned to you. Ask an admin to assign you, or open one of your own requests."
        action={<Link href={`${base}/analyses`} className="text-sm font-medium text-accent underline">Back to analyses</Link>}
      />
    );
  }
  let conversation: WbConversation;
  let look: WbFirstLook | null = null;
  try {
    conversation = (await wbGet(id)).conversation;
    look = await wbFirstLook(id).catch(() => null);
  } catch {
    return (
      <EmptyState
        icon={<PlugZap />}
        title="The analysis server didn't answer"
        why="Your files and proposals are safe on the server. Try again in a minute; if it keeps failing, check the engine status under Settings → Integrations."
        action={<Link href={`${base}/analyses/w/${id}`} className="text-sm font-medium text-accent underline">Try again</Link>}
      />
    );
  }
  const rid = access.row.requestId;
  const ctx = rid ? await requestContext(rid) : null;
  const files = rid ? await requestFiles(rid) : [];
  return (
    <Workbench
      initial={conversation}
      firstLook={look}
      request={ctx ? { id: ctx.req.id, number: ctx.req.number, href: requestHref(base, ctx.req.id), reviewRound: ctx.req.reviewRound } : null}
      files={files.map((f) => ({ id: f.id, fileName: f.fileName, kind: f.kind, stage: f.stage, usable: f.usable, litchaiDocumentId: f.litchaiDocumentId, litchaiStatus: f.litchaiStatus }))}
      pdfDocs={files.filter((f) => PDF_TYPE.test(f.fileName) && f.litchaiDocumentId).map((f) => Number(f.litchaiDocumentId))}
      canDeliver={Boolean(rid)}
    />
  );
}

/** /…/analyses/w/new?requestId= — choose files (or a blank workbook) and open. */
export async function StartScreen({ requestId, base, isAdmin }: { requestId: string | null; base: Base; isAdmin: boolean }) {
  if (requestId && !(await canWorkOnRequest(requestId))) {
    return (
      <EmptyState
        icon={<Lock />}
        title="This request isn't assigned to you"
        why="You can open the workbench on requests assigned to you."
        action={<Link href={`${base}/analyses`} className="text-sm font-medium text-accent underline">Back</Link>}
      />
    );
  }
  if (!requestId && !isAdmin) {
    return (
      <EmptyState
        icon={<FileSpreadsheet />}
        title="Open a request first"
        why="The workbench opens on a request's files. Choose one of your requests."
        action={<Link href="/work/requests" className="text-sm font-medium text-accent underline">My requests</Link>}
      />
    );
  }
  const ctx = requestId ? await requestContext(requestId) : null;
  if (requestId && !ctx) notFound();
  const files = requestId ? await requestFiles(requestId) : [];
  const existing = requestId ? await conversationsFor([requestId], 10) : [];
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-[12px] text-muted">{ctx ? `${ctx.req.number} · ${ctx.c?.company || ctx.c?.name || "Client"}` : "No request"}</p>
      <h1 className="mt-0.5 font-display text-xl font-semibold text-ink">Open in the workbench</h1>
      <p className="mt-1 text-sm text-body">
        Choose the files Sage should read. It reads every sheet first and tells you what it found; nothing in a file changes until you accept.
        {ctx?.c?.aiMode === "local_only" ? " This client is set to local only, so nothing leaves our server." : ""}
      </p>
      {existing.length > 0 && (
        <section className="mt-5 rounded-card border border-hairline bg-paper p-4">
          <h2 className="text-sm font-semibold text-ink">Carry on where you left off</h2>
          <ul className="mt-2 divide-y divide-hairline">
            {existing.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
                <FileSpreadsheet className="size-4 text-good" aria-hidden />
                <Link href={`${base}/analyses/w/${c.id}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:underline">{c.title}</Link>
                <span className="shrink-0 text-[12px] text-muted">{(c.updatedAt as Date).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <StartForm
        base={base}
        requestId={requestId}
        requestHref={requestId ? requestHref(base, requestId) : null}
        files={files.map((f) => ({ id: f.id, fileName: f.fileName, kind: f.kind, stage: f.stage, usable: f.usable, litchaiDocumentId: f.litchaiDocumentId, litchaiStatus: f.litchaiStatus }))}
      />
    </div>
  );
}

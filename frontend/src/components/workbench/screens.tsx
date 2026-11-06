import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet, FolderOpen, LayoutTemplate, Lock, PlugZap, ShieldCheck, Sparkles, Table2, Upload } from "lucide-react";
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
  const local = ctx?.c?.aiMode === "local_only";
  const reqLabel = ctx ? `${ctx.req.number} · ${ctx.c?.company || ctx.c?.name || "Client"}` : "No request";
  const starters = [
    { icon: FolderOpen, title: ctx ? `From ${ctx.req.number}` : "From a request", text: ctx ? `${files.length} ${files.length === 1 ? "file" : "files"} on this request` : "Open a request, then its files" },
    { icon: Upload, title: "Upload files", text: "From your computer: XLSX, XLS, ODS, CSV, JSON, DOCX or PDF" },
    { icon: Table2, title: "New blank workbook", text: "Describe it and Sage lays it out" },
    { icon: LayoutTemplate, title: "Start from a template", text: "P&L · CIT · VAT return · PAYE · Bank rec" },
  ];
  const examples = ["Build a CIT computation for FY2025", "Reconcile the ledger to the bank statement", "Make a PAYE schedule for every employee"];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[12px] text-muted">{reqLabel}</p>
          <h1 className="mt-0.5 font-display text-xl font-semibold text-ink">New analysis</h1>
        </div>
        <span className={local ? "inline-flex items-center gap-1.5 rounded-full bg-violet-soft px-2.5 py-1 text-xs font-medium text-violet" : "inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-body"}>
          {local ? <Lock className="size-3.5" aria-hidden /> : <ShieldCheck className="size-3.5" aria-hidden />}
          {local ? "Local only" : "Cloud, masked"}
        </span>
      </div>

      <div className="grid overflow-hidden rounded-card border border-hairline bg-paper lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Sheet side: the empty workspace with the drop zone. */}
        <section aria-label="Workbook" className="flex min-h-[28rem] flex-col">
          <div className="flex-1 p-4 sm:p-6">
            <div className="mx-auto max-w-xl rounded-card border-2 border-dashed border-line-strong p-5 text-center sm:p-6">
              <span className="mx-auto grid size-10 place-items-center rounded-ctl bg-brand-tint text-accent" aria-hidden>
                <FileSpreadsheet className="size-5" />
              </span>
              <h2 className="mt-3 font-display text-base font-semibold text-ink">Open a workbook, CSV or PDF</h2>
              <p className="mt-1 text-sm text-body">
                Choose the files Sage should read. It reads every sheet first and tells you what it found. Nothing in a file changes until you accept.
                {local ? " This client is set to local only, so nothing leaves our server." : " Files are encrypted before they reach the analysis server."}
              </p>
              <div className="text-left">
                <StartForm
                  base={base}
                  requestId={requestId}
                  requestHref={requestId ? requestHref(base, requestId) : null}
                  files={files.map((f) => ({ id: f.id, fileName: f.fileName, kind: f.kind, stage: f.stage, usable: f.usable, litchaiDocumentId: f.litchaiDocumentId, litchaiStatus: f.litchaiStatus }))}
                />
              </div>
            </div>

            {existing.length > 0 && (
              <section className="mx-auto mt-5 max-w-xl rounded-card border border-hairline p-4">
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
          </div>
          <div className="flex items-center gap-1 border-t border-hairline bg-cloud px-3 py-1.5 text-[12px]" aria-hidden>
            <span className="rounded-t bg-paper px-3 py-1 font-medium text-ink">Sheet1</span>
            <span className="px-2 text-muted">+</span>
          </div>
        </section>

        {/* Sage side: what it can do, before a file is open. */}
        <aside aria-label="Sage" className="flex flex-col border-t border-hairline bg-cloud/50 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <Sparkles className="size-4 text-accent" aria-hidden />
            <p className="text-sm font-semibold text-ink">Sage <span className="font-normal text-muted">· one thread for this file</span></p>
          </div>
          <div className="flex-1 space-y-3 p-4">
            <p className="text-sm text-body">
              Open a client&rsquo;s files and I will read them first, then tell you what I found. You can also ask me to build a new workbook from scratch. Selecting cells is optional.
            </p>
            <ul className="space-y-2">
              {starters.map((s) => (
                <li key={s.title} className="flex items-start gap-3 rounded-ctl border border-hairline bg-paper p-3">
                  <s.icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{s.title}</span>
                    <span className="block text-[12.5px] text-muted">{s.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-muted">Try asking, once a workbook is open</p>
              <ul className="space-y-1.5">
                {examples.map((e) => (
                  <li key={e} className="rounded-ctl border border-hairline bg-paper px-3 py-2 text-[13px] text-body">{e}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="flex items-center gap-1.5 border-t border-hairline px-4 py-2.5 text-[12px] text-muted">
            {local ? <Lock className="size-3.5" aria-hidden /> : <ShieldCheck className="size-3.5" aria-hidden />}
            {local ? "Local only · nothing leaves our server" : "Cloud, masked · names, accounts and TINs become tokens"}
          </p>
        </aside>
      </div>
    </div>
  );
}

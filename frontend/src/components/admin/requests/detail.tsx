"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, FileText, Loader2, MessageSquare, Plus, Send, Upload, X } from "lucide-react";
import { Button, EmptyState, Segmented, Sheet, StatusChip } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { Uploader } from "@/components/ui/uploader";
import {
  createAskAction,
  recordStagedDeliverableAction,
  remindAskAction,
  sendDraftForReviewAction,
  setAskStatusAction,
  setDeliverableStageAction,
  undoAskStatusAction,
  unassignAction,
} from "@/app/admin/requests/work-actions";
import { adminAddNoteAction } from "@/app/admin/requests/actions";
import type { TeamMember } from "@/app/admin/_lib/requests-data";
import { AssignSheet } from "./assign-sheet";
import { MoveSheet } from "./move-sheet";
import { cn } from "@/lib/utils";

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const inputCls = "w-full rounded-ctl border border-line-strong bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

/* ─────────────────────────── header: Ask client + Move to ─────────────────────────── */

export function RequestHeaderActions({ requestId, number, status, clientName }: { requestId: string; number: string; status: string; clientName: string }) {
  const [ask, setAsk] = useState(false);
  const [move, setMove] = useState(false);
  const closed = ["completed", "cancelled", "declined", "refunded"].includes(status);
  return (
    <>
      {!closed && (
        <Button onClick={() => setAsk(true)}>
          <Plus className="size-4" /> Ask client
        </Button>
      )}
      {!closed && (
        <Button variant="primary" onClick={() => setMove(true)}>
          Move to…
        </Button>
      )}
      <AskSheet open={ask} onClose={() => setAsk(false)} requestId={requestId} clientName={clientName} />
      <MoveSheet open={move} onClose={() => setMove(false)} rows={[{ id: requestId, status, number }]} />
    </>
  );
}

export function OpenMoveButton({ requestId, number, status, label, variant = "primary" }: { requestId: string; number: string; status: string; label: string; variant?: "primary" | "secondary" }) {
  const [move, setMove] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setMove(true)}>
        {label}
      </Button>
      <MoveSheet open={move} onClose={() => setMove(false)} rows={[{ id: requestId, status, number }]} />
    </>
  );
}

/* ─────────────────────────── asks ─────────────────────────── */

function AskSheet({ open, onClose, requestId, clientName }: { open: boolean; onClose: () => void; requestId: string; clientName: string }) {
  const toast = useToast();
  const router = useRouter();
  const [kind, setKind] = useState<"document" | "info">("document");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await createAskAction({ requestId, kind, title, detail, dueAt: due });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success(r.message);
    setTitle("");
    setDetail("");
    setDue("");
    router.refresh();
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Ask the client"
      description={clientName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={go} disabled={busy || title.trim().length < 3}>
            {busy ? "Sending…" : "Send the ask"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <Segmented
          label="What you need"
          value={kind}
          onChange={setKind}
          options={[
            { value: "document", label: "A document" },
            { value: "info", label: "Information" },
          ]}
        />
        <label className="block">
          <span className="mb-1.5 block font-medium text-ink">What do you need?</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder={kind === "document" ? "Q4 2025 fixed-asset register" : "Was the ₦15m on 24 Dec a director's loan?"} />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-medium text-ink">Why, in a sentence the client understands</span>
          <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} className={inputCls} placeholder="We need it to work out capital allowances, which lower your CIT." />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-medium text-ink">Due (optional)</span>
          <input type="date" value={due} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDue(e.target.value)} className={inputCls} />
        </label>
        <p className="rounded-ctl bg-surface p-3 text-body">
          The client gets an email, a push notice and a task on their Home. It shows as Open until they supply it, then you mark it received.
        </p>
        {err ? <p className="text-bad">{err}</p> : null}
      </div>
    </Sheet>
  );
}

export type AskRow = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  status: string;
  answer: string | null;
  dueAt: string | null;
  suppliedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
};

export function AsksPanel({ requestId, clientName, items, closed }: { requestId: string; clientName: string; items: AskRow[]; closed: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const setStatus = async (it: AskRow, status: "open" | "received" | "cancelled") => {
    setBusy(it.id);
    const r = await setAskStatusAction({ itemId: it.id, status });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    router.refresh();
    const undoId = r.undoId;
    toast.action(r.message, {
      label: "Undo",
      onAction: async () => {
        if (!undoId) return;
        const u = await undoAskStatusAction(undoId);
        if (u.ok) router.refresh();
        else toast.error(u.error);
      },
    });
  };
  const remind = async (it: AskRow) => {
    setBusy(it.id);
    const r = await remindAskAction(it.id);
    setBusy(null);
    if (r.ok) toast.success(r.message);
    else toast.error(r.error);
  };
  const live = items.filter((i) => i.status !== "cancelled");

  return (
    <div>
      {live.length === 0 ? (
        <EmptyState
          compact
          icon={<MessageSquare />}
          title="Nothing asked yet"
          why="Ask for a document or an answer at any time. The client sees it on their Home with a due date."
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {live.map((it) => (
            <li key={it.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:gap-3">
              <span
                aria-hidden
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-ctl",
                  it.status === "open" ? "bg-warn-soft text-warn" : it.status === "supplied" ? "bg-info-soft text-info" : "bg-good-soft text-good",
                )}
              >
                {it.kind === "info" ? <MessageSquare className="size-4" /> : <FileText className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{it.title}</p>
                <p className="text-sm text-body">
                  {it.status === "open"
                    ? `Asked ${fmt(it.createdAt)}${it.dueAt ? ` · due ${new Date(it.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}`
                    : it.status === "supplied"
                      ? `Supplied ${fmt(it.suppliedAt)}`
                      : `Received ${fmt(it.receivedAt)}`}
                  {it.answer ? ` · “${it.answer}”` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
                <StatusChip domain="item" status={it.status} size="sm" />
                {it.status === "supplied" && (
                  <>
                    <Button size="sm" variant="primary" disabled={busy === it.id} onClick={() => setStatus(it, "received")}>
                      <Check className="size-4" /> Mark received
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === it.id} onClick={() => setStatus(it, "open")}>
                      Ask again
                    </Button>
                  </>
                )}
                {it.status === "open" && !closed && (
                  <>
                    <Button size="sm" disabled={busy === it.id} onClick={() => remind(it)}>
                      <Bell className="size-4" /> Remind
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Cancel ask: ${it.title}`} disabled={busy === it.id} onClick={() => setStatus(it, "cancelled")}>
                      <X className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!closed && (
        <Button size="sm" className="mt-3" onClick={() => setAsk(true)}>
          <Plus className="size-4" /> Ask for info or a document
        </Button>
      )}
      <AskSheet open={ask} onClose={() => setAsk(false)} requestId={requestId} clientName={clientName} />
    </div>
  );
}

/* ─────────────────────────── deliverables ─────────────────────────── */

export type DeliverableRow = { id: string; fileName: string; stage: string | null; createdAt: string; by: string | null; sizeBytes: number; variant: string | null };
export type RoundRow = { round: number; fileName: string | null; sentAt: string; decision: string | null; decidedAt: string | null; comments: string | null };

export function DeliverablesPanel({
  requestId,
  status,
  files,
  rounds,
}: {
  requestId: string;
  status: string;
  files: DeliverableRow[];
  rounds: RoundRow[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [stage, setStage] = useState<"draft" | "final">("draft");
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const canReview = ["in_progress", "in_review", "client_review"].includes(status);

  const download = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/requests/${requestId}/docs?documentId=${id}`);
      const body = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (body.ok && body.url) window.location.assign(body.url);
      else toast.error(body.error || "The download could not be prepared.");
    } catch {
      toast.error("The download could not be prepared. Try again.");
    }
    setBusy(null);
  };
  const run = async (key: string, fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    start(() => router.refresh());
  };

  return (
    <div className="space-y-5">
      {files.length === 0 ? (
        <EmptyState compact icon={<FileText />} title="No deliverables yet" why="Upload a draft for the client to review, or the final files to deliver. Drafts never move the request on by themselves." />
      ) : (
        <ul className="divide-y divide-hairline">
          {files.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-ctl bg-surface text-[10px] font-bold uppercase text-body">{f.fileName.split(".").pop()?.slice(0, 4)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{f.fileName}</p>
                <p className="text-sm text-body">
                  {fmt(f.createdAt)}
                  {f.by ? ` · ${f.by}` : ""}
                  {f.variant === "manual_override" ? " · published without verification" : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
                <StatusChip domain="deliverable" status={f.stage ?? "final"} size="sm" />
                <Button size="sm" variant="ghost" disabled={busy === f.id} onClick={() => download(f.id)}>
                  {busy === f.id ? <Loader2 className="size-4 animate-spin" /> : "Download"}
                </Button>
                {(f.stage ?? "final") === "draft" ? (
                  <>
                    {canReview && (
                      <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => run(`send-${f.id}`, () => sendDraftForReviewAction(requestId, f.id))}>
                        <Send className="size-4" /> Send for review
                      </Button>
                    )}
                    <Button size="sm" disabled={busy !== null} onClick={() => run(`stage-${f.id}`, () => setDeliverableStageAction(f.id, "final"))}>
                      Mark final
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(`stage-${f.id}`, () => setDeliverableStageAction(f.id, "draft"))}>
                    Mark draft
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-card border border-dashed border-line-strong p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-medium text-ink">
            <Upload className="size-4" /> Upload
          </p>
          <Segmented
            size="sm"
            label="Stage of the upload"
            value={stage}
            onChange={setStage}
            options={[
              { value: "draft", label: "Draft" },
              { value: "final", label: "Final" },
            ]}
          />
        </div>
        <p className="mb-3 text-sm text-body">
          {stage === "draft"
            ? "A draft is kept with the team until you press Send for review."
            : "Final moves the request to Delivered and tells the client. Issue the balance invoice from Billing if there is one."}
        </p>
        <Uploader
          target={{ kind: "request", requestId }}
          accept=".xlsx,.xls,.csv,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.zip"
          submitLabel={stage === "draft" ? "Save draft" : "Publish final and tell the client"}
          hint="XLSX, CSV, PDF, DOCX, PPTX, images or ZIP · up to 25 MB each"
          onSubmit={async (results) => {
            for (const r of results) {
              if (!r.key) continue;
              const rec = await recordStagedDeliverableAction({
                requestId,
                fileName: r.file.name,
                contentType: r.file.type || undefined,
                sizeBytes: r.file.size,
                r2Key: r.key,
                stage,
              });
              if (!rec.ok) return { ok: false, error: rec.error };
            }
            return { ok: true };
          }}
          onDone={() => {
            toast.success(stage === "draft" ? "Draft saved." : "Final published. The client was told.");
            router.refresh();
          }}
        />
      </div>

      {rounds.length > 0 && (
        <div>
          <h3 className="mb-2 font-display text-[15px] font-semibold text-ink">Review rounds</h3>
          <ol className="space-y-2">
            {rounds.map((r) => (
              <li key={r.round} className="rounded-ctl border border-hairline p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">
                    Round {r.round}
                    {r.fileName ? ` · ${r.fileName}` : ""}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      r.decision === "approved" ? "bg-good-soft text-good" : r.decision === "changes" ? "bg-warn-soft text-warn" : "bg-info-soft text-info",
                    )}
                  >
                    {r.decision === "approved" ? "Approved" : r.decision === "changes" ? "Changes asked" : "Waiting on client"}
                  </span>
                </div>
                <p className="mt-1 text-body">
                  Sent {fmt(r.sentAt)}
                  {r.decidedAt ? ` · answered ${fmt(r.decidedAt)}` : ""}
                </p>
                {r.comments ? <p className="mt-1 text-ink">“{r.comments}”</p> : null}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── assignment card ─────────────────────────── */

export function AssignCard({
  requestId,
  label,
  team,
  assignees,
  legacy,
  initialOpen = false,
}: {
  initialOpen?: boolean;
  requestId: string;
  label: string;
  team: TeamMember[];
  assignees: Array<{ userId: string; name: string; role: string | null; at: string }>;
  legacy: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [busy, setBusy] = useState<string | null>(null);
  const remove = async (userId: string) => {
    setBusy(userId);
    const r = await unassignAction(requestId, userId);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    router.refresh();
  };
  return (
    <section className="rounded-card border border-hairline bg-paper p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Assigned</h3>
        <Button size="sm" onClick={() => setOpen(true)}>
          {assignees.length ? "Change" : "Assign"}
        </Button>
      </div>
      {assignees.length === 0 ? (
        <p className="text-sm text-body">{legacy ? `Noted as “${legacy}” (not a team account). Assign a person so they see it in their work.` : "Nobody yet. Staff only see requests assigned to them."}</p>
      ) : (
        <ul className="space-y-2">
          {assignees.map((a) => (
            <li key={a.userId} className="flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-xs font-semibold text-brand">
                {a.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                <p className="text-xs text-muted">
                  {a.role === "admin" ? "Admin" : "Staff"} · since {new Date(a.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                disabled={busy === a.userId}
                onClick={() => remove(a.userId)}
                className="grid size-8 place-items-center rounded-ctl text-muted hover:bg-surface hover:text-bad"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <AssignSheet open={open} onClose={() => setOpen(false)} requestIds={[requestId]} label={label} team={team} current={assignees.map((a) => a.userId)} />
    </section>
  );
}

/* ─────────────────────────── note composer ─────────────────────────── */

export function NoteComposer({ requestId }: { requestId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [vis, setVis] = useState<"internal" | "client">("internal");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await adminAddNoteAction(requestId, note, vis);
    setBusy(false);
    if (!r.ok) return toast.error(r.error || "The note did not save.");
    toast.success(vis === "client" ? "Note posted and emailed to the client." : "Team note added.");
    setNote("");
    router.refresh();
  };
  return (
    <div className={cn("rounded-card border p-3", vis === "internal" ? "border-dashed border-warn/50 bg-warn-soft/40" : "border-hairline bg-paper")}>
      <div className="mb-2">
        <Segmented
          size="sm"
          label="Who sees the note"
          value={vis}
          onChange={setVis}
          options={[
            { value: "internal", label: "Team note" },
            { value: "client", label: "Note to client" },
          ]}
        />
      </div>
      <textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Note"
        placeholder={vis === "internal" ? "Only the team sees this." : "The client sees this on their timeline and by email."}
        className={inputCls}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="primary" onClick={go} disabled={busy || !note.trim()}>
          {busy ? "Saving…" : vis === "internal" ? "Add team note" : "Post and email client"}
        </Button>
      </div>
    </div>
  );
}

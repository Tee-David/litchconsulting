"use client";

import { useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  Loader2,
  Lock,
  MessageSquarePlus,
  PackagePlus,
  UserRound,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import { LEGAL_TRANSITIONS, STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";
import {
  adminSetRequestStatusAction,
  adminAddNoteAction,
  adminAssignRequestAction,
  adminRecordDeliverableAction,
  adminLinkInvoiceAction,
} from "../actions";

/**
 * The admin's control panel on a request: status moves (legal targets only,
 * note travels to the client), internal/client notes, deliverable upload
 * (private bucket presign → PUT → record), assignee, and invoice linking.
 */
export function AdminRequestPanel({
  requestId,
  status,
  assignee,
  hasInvoice,
}: {
  requestId: string;
  status: string;
  assignee: string | null;
  hasInvoice: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const targets = LEGAL_TRANSITIONS[status as RequestStatus] ?? [];
  const [toStatus, setToStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState("");

  const [note, setNote] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"internal" | "client">("internal");

  const [assigneeDraft, setAssigneeDraft] = useState(assignee ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function applyStatus() {
    if (!toStatus) return;
    startTransition(async () => {
      const res = await adminSetRequestStatusAction(requestId, toStatus, statusNote || undefined);
      if (!res.ok) return toast.error(res.error || "Could not update status");
      toast.success(`Moved to ${STATUS_LABELS[toStatus as RequestStatus] ?? toStatus}`);
      setToStatus("");
      setStatusNote("");
    });
  }

  function addNote() {
    startTransition(async () => {
      const res = await adminAddNoteAction(requestId, note, noteVisibility);
      if (!res.ok) return toast.error(res.error || "Could not add note");
      toast.success(noteVisibility === "client" ? "Note sent to client" : "Internal note added");
      setNote("");
    });
  }

  function saveAssignee() {
    startTransition(async () => {
      const res = await adminAssignRequestAction(requestId, assigneeDraft);
      if (!res.ok) return toast.error(res.error || "Could not assign");
      toast.success("Assignee updated");
    });
  }

  function linkInvoice() {
    if (!invoiceNumber.trim()) return;
    startTransition(async () => {
      const res = await adminLinkInvoiceAction(requestId, invoiceNumber);
      if (!res.ok) return toast.error(res.error || "Could not link invoice");
      toast.success("Invoice linked");
      setInvoiceNumber("");
    });
  }

  async function uploadDeliverable(file: File) {
    setUploading(true);
    try {
      const presign = await fetch(`/api/requests/${requestId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      }).then((r) => r.json());
      if (!presign.ok) throw new Error(presign.error || "Could not prepare upload");

      const put = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed — try again");

      const rec = await adminRecordDeliverableAction({
        requestId,
        fileName: file.name,
        contentType: file.type || undefined,
        sizeBytes: file.size,
        r2Key: presign.key,
      });
      if (!rec.ok) throw new Error(rec.error || "Could not record deliverable");
      toast.success("Deliverable published — client notified");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const inputCls =
    "w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

  return (
    <div className="space-y-5">
      {/* Status control */}
      <div className="rounded-card border border-hairline bg-paper p-5">
        <h3 className="font-display text-sm font-bold text-ink">Update status</h3>
        {targets.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Lock className="size-4" /> This request is closed.
          </p>
        ) : (
          <>
            <div className="relative mt-3">
              <select
                value={toStatus}
                onChange={(e) => setToStatus(e.target.value)}
                className={cn(inputCls, "appearance-none pr-9")}
              >
                <option value="">Move to…</option>
                {targets.map((t) => (
                  <option key={t} value={t}>
                    {STATUS_LABELS[t]}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            </div>
            <textarea
              rows={2}
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="Note for the client (required for cancel/decline/refund)…"
              className={cn(inputCls, "mt-2")}
            />
            <button
              type="button"
              onClick={applyStatus}
              disabled={!toStatus || pending}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50 keep-brand"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Apply & notify client
            </button>
          </>
        )}
      </div>

      {/* Deliverable upload */}
      <div className="rounded-card border border-hairline bg-paper p-5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold text-ink">
          <PackagePlus className="size-4 text-brand" /> Publish deliverable
        </h3>
        <p className="mt-1 text-xs text-muted">
          Uploads to the private bucket, marks the request delivered, and emails the client.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf,.docx,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadDeliverable(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-hairline px-5 py-2.5 text-sm font-semibold text-body transition-colors hover:border-brand/40 hover:bg-surface disabled:opacity-50"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
          {uploading ? "Uploading…" : "Choose file & publish"}
        </button>
      </div>

      {/* Note composer */}
      <div className="rounded-card border border-hairline bg-paper p-5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold text-ink">
          <MessageSquarePlus className="size-4 text-brand" /> Add a note
        </h3>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What's happening on this request?"
          className={cn(inputCls, "mt-3")}
        />
        <div className="mt-2 flex gap-1 rounded-full border border-hairline p-1">
          {(["internal", "client"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setNoteVisibility(v)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                noteVisibility === v ? "bg-brand text-white keep-brand" : "text-muted hover:text-ink"
              )}
            >
              {v === "internal" ? "Internal only" : "Visible to client"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={addNote}
          disabled={!note.trim() || pending}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-hairline px-5 py-2.5 text-sm font-semibold text-body transition-colors hover:border-brand/40 hover:bg-surface disabled:opacity-50"
        >
          {noteVisibility === "client" ? "Add note & email client" : "Add internal note"}
        </button>
      </div>

      {/* Assignee + invoice link */}
      <div className="rounded-card border border-hairline bg-paper p-5">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold text-ink">
          <UserRound className="size-4 text-brand" /> Assignee
        </h3>
        <div className="mt-3 flex gap-2">
          <input
            value={assigneeDraft}
            onChange={(e) => setAssigneeDraft(e.target.value)}
            placeholder="Who's handling this?"
            className={inputCls}
          />
          <button
            type="button"
            onClick={saveAssignee}
            disabled={pending}
            className="rounded-full border border-hairline px-4 text-sm font-semibold text-body transition-colors hover:bg-surface"
          >
            Save
          </button>
        </div>

        {!hasInvoice && (
          <>
            <h3 className="mt-5 flex items-center gap-2 font-display text-sm font-bold text-ink">
              <Link2 className="size-4 text-brand" /> Link invoice
            </h3>
            <div className="mt-3 flex gap-2">
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-2026-001"
                className={inputCls}
              />
              <button
                type="button"
                onClick={linkInvoice}
                disabled={pending || !invoiceNumber.trim()}
                className="rounded-full border border-hairline px-4 text-sm font-semibold text-body transition-colors hover:bg-surface disabled:opacity-50"
              >
                Link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

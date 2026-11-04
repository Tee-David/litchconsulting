"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Send, Upload } from "lucide-react";
import { Button, ConfirmSheet, EmptyState, StatusChip } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { recordDeliverableAction, sendDraftAction } from "@/app/work/actions";

export type StaffFile = { id: string; fileName: string; stage: string | null; createdAt: string; by: string | null; inRound: number | null };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short" });

async function upload(requestId: string, file: File, onProgress: (p: number) => void): Promise<string> {
  const res = await fetch(`/work/requests/${requestId}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: file.size }),
  });
  const b = (await res.json().catch(() => ({}))) as { ok?: boolean; key?: string; uploadUrl?: string; error?: string };
  if (!res.ok || !b.ok || !b.key || !b.uploadUrl) throw new Error(b.error || "Could not start the upload.");
  try {
    await new Promise<void>((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("PUT", b.uploadUrl!);
      x.setRequestHeader("Content-Type", file.type);
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      x.onload = () => (x.status < 300 ? resolve() : reject(new Error(String(x.status))));
      x.onerror = () => reject(new Error("network"));
      x.send(file);
    });
    return b.key;
  } catch {
    const form = new FormData();
    form.append("file", file);
    const relay = await fetch(`/work/requests/${requestId}/upload`, { method: "POST", body: form });
    const rb = (await relay.json().catch(() => ({}))) as { ok?: boolean; key?: string; error?: string };
    if (!relay.ok || !rb.ok || !rb.key) throw new Error(rb.error || "The upload failed. Try again.");
    return rb.key;
  }
}

/** Drafts and finals: upload, download, and send a draft for the client's review. */
export function StaffDeliverables({ requestId, files, canSend, status }: { requestId: string; files: StaffFile[]; canSend: boolean; status: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState<StaffFile | null>(null);
  const [note, setNote] = useState("");

  const onFile = async (file: File) => {
    setErr(null);
    setPct(0);
    try {
      const key = await upload(requestId, file, setPct);
      const r = await recordDeliverableAction({ requestId, key, fileName: file.name, contentType: file.type || null, sizeBytes: file.size });
      if (!r.ok) throw new Error(r.error);
      toast.success(r.message ?? "File added");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setPct(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <input id="deliverable" type="file" className="sr-only" accept=".xlsx,.xls,.csv,.pdf,.docx,.png,.jpg,.jpeg" disabled={pct !== null} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <label htmlFor="deliverable" className="flex cursor-pointer items-center gap-3 rounded-ctl border border-dashed border-line-strong bg-surface px-4 py-3 text-sm hover:border-accent focus-within:ring-2 focus-within:ring-accent/40">
          {pct !== null ? <Loader2 className="size-5 animate-spin text-muted" aria-hidden /> : <Upload className="size-5 text-muted" aria-hidden />}
          <span>
            <b className="block text-ink">{pct !== null ? `Uploading… ${pct}%` : "Add a draft or final file"}</b>
            <span className="text-muted">It stays private until you send it to the client.</span>
          </span>
        </label>
        {err ? <p role="alert" className="mt-2 text-sm text-bad">{err}</p> : null}
      </div>
      {files.length === 0 ? (
        <EmptyState compact title="No deliverables yet" why="Upload the draft here, then send it to the client for review." />
      ) : (
        <ul className="divide-y divide-hairline rounded-card border border-hairline bg-paper">
          {files.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{f.fileName}</p>
                <p className="text-xs text-muted">
                  {fmt(f.createdAt)}
                  {f.by ? ` · ${f.by}` : ""}
                  {f.inRound ? ` · sent as draft ${f.inRound}` : ""}
                </p>
              </div>
              <StatusChip domain="deliverable" status={f.stage === "final" ? "final" : "draft"} size="sm" />
              <div className="flex gap-2">
                <a href={`/work/files/${f.id}`} aria-label={`Download ${f.fileName}`} className="grid size-8 place-items-center rounded-ctl text-muted hover:bg-surface hover:text-ink">
                  <Download className="size-4" />
                </a>
                {canSend && !f.inRound ? (
                  <Button size="sm" variant="primary" onClick={() => setSending(f)}>
                    <Send className="size-3.5" aria-hidden /> Send for review
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!canSend && ["client_review"].includes(status) ? <p className="text-sm text-muted">A draft is with the client. You can send the next one after they decide.</p> : null}

      <ConfirmSheet
        open={sending !== null}
        onClose={() => setSending(null)}
        title="Send this draft to the client?"
        body={
          <div className="space-y-3">
            <p>
              <b className="text-ink">{sending?.fileName}</b> goes to the client for review. They approve it or ask for changes; you are told either way.
            </p>
            <label className="block text-sm font-medium text-ink">
              Note for the client (optional)
              <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full rounded-ctl border border-line-strong bg-paper px-3 py-2 text-sm font-normal text-ink outline-none focus:border-accent" />
            </label>
          </div>
        }
        confirmLabel="Send for review"
        onConfirm={async () => {
          if (!sending) return;
          const r = await sendDraftAction(requestId, sending.id, note);
          if (!r.ok) throw new Error(r.error);
          toast.success(r.message ?? "Sent");
          setNote("");
          router.refresh();
        }}
      />
    </div>
  );
}

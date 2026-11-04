"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, EmptyState, Sheet, StatusChip } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { askClientAction, markReceivedAction, undoReceivedAction } from "@/app/work/actions";

export type StaffAsk = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  status: string;
  dueAt: string | null;
  answer: string | null;
  documentId: string | null;
  suppliedAt: string | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short" });

/** Asks on a request: check what the client supplied, mark it received, ask for more. */
export function StaffAsks({ requestId, items, canAsk }: { requestId: string; items: StaffAsk[]; canAsk: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: "document" as "document" | "info", title: "", detail: "", dueAt: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const receive = async (id: string) => {
    setBusy(id);
    const r = await markReceivedAction(id);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.action(r.message ?? "Marked received", {
      label: "Undo",
      onAction: async () => {
        const u = await undoReceivedAction(id);
        if (!u.ok) toast.error(u.error);
        router.refresh();
      },
    });
    router.refresh();
  };

  const ask = async () => {
    setSaving(true);
    setErr(null);
    const r = await askClientAction({ requestId, ...form });
    setSaving(false);
    if (!r.ok) return setErr(r.error);
    toast.success(r.message ?? "Sent");
    setOpen(false);
    setForm({ kind: "document", title: "", detail: "", dueAt: "" });
    router.refresh();
  };

  const order = { supplied: 0, open: 1, received: 2 } as Record<string, number>;
  const sorted = [...items].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

  return (
    <div>
      {canAsk ? (
        <div className="mb-4 flex justify-end">
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden /> Ask the client
          </Button>
        </div>
      ) : null}
      {sorted.length === 0 ? (
        <EmptyState compact title="No asks on this request" why="Ask the client for a document or an answer. They get an email and see it at the top of their dashboard." />
      ) : (
        <ul className="divide-y divide-hairline rounded-card border border-hairline bg-paper">
          {sorted.map((it) => (
            <li key={it.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink">{it.title}</p>
                  <StatusChip domain="item" status={it.status} size="sm" />
                  <span className="text-xs text-muted">{it.kind === "document" ? "Document" : "Question"}</span>
                </div>
                {it.detail ? <p className="mt-1 text-sm text-body">{it.detail}</p> : null}
                {it.answer ? <p className="mt-1 rounded-ctl bg-surface p-2 text-sm text-ink">{it.answer}</p> : null}
                <p className="mt-1 text-xs text-muted">
                  {it.status === "open" && it.dueAt ? `Due ${fmt(it.dueAt)}` : it.suppliedAt ? `Supplied ${fmt(it.suppliedAt)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {it.documentId ? (
                  <a className="inline-flex h-8 items-center rounded-ctl border border-line-strong px-2.5 text-[13px] font-medium text-ink hover:bg-surface" href={`/work/files/${it.documentId}`}>
                    Download
                  </a>
                ) : null}
                {it.status === "supplied" ? (
                  <Button size="sm" variant="primary" disabled={busy === it.id} onClick={() => receive(it.id)}>
                    {busy === it.id ? "Saving…" : "Mark received"}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!saving}
        title="Ask the client"
        description="They get an email and see it at the top of their dashboard. Say why you need it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={ask} disabled={saving || form.title.trim().length < 3}>{saving ? "Sending…" : "Send ask"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">What do you need?</legend>
            <div className="flex gap-4">
              {(["document", "info"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm text-body">
                  <input type="radio" name="kind" checked={form.kind === k} onChange={() => setForm((f) => ({ ...f, kind: k }))} className="size-4 accent-[var(--color-act)]" />
                  {k === "document" ? "A document" : "An answer"}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-medium text-ink">
            {form.kind === "document" ? "Document" : "Question"}
            <input value={form.title} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="mt-1.5 h-10 w-full rounded-ctl border border-line-strong bg-paper px-3 text-sm font-normal text-ink outline-none focus:border-accent" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Why (in plain words)
            <textarea rows={3} maxLength={2000} value={form.detail} onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))} className="mt-1.5 w-full rounded-ctl border border-line-strong bg-paper px-3 py-2 text-sm font-normal text-ink outline-none focus:border-accent" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Due date (optional)
            <input type="date" value={form.dueAt} onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} className="mt-1.5 h-10 w-full rounded-ctl border border-line-strong bg-paper px-3 text-sm font-normal text-ink outline-none focus:border-accent" />
          </label>
          {err ? <p role="alert" className="text-sm text-bad">{err}</p> : null}
        </div>
      </Sheet>
    </div>
  );
}

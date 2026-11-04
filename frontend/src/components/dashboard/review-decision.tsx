"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button, ConfirmSheet } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { decideReviewAction } from "@/app/dashboard/requests/flow-actions";

/** Approve the draft, or ask for changes with one or more comments. */
export function ReviewDecision({ requestId, round, included, who }: { requestId: string; round: number; included: number; who: string }) {
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<"decide" | "changes" | "done">("decide");
  const [approveOpen, setApproveOpen] = useState(false);
  const [comments, setComments] = useState([{ anchor: "", text: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const extra = round >= included;

  const sendChanges = async () => {
    const list = comments.filter((c) => c.text.trim()).map((c) => ({ text: c.text.trim(), anchor: c.anchor.trim() || undefined }));
    if (!list.length) return setErr("Tell us what to change.");
    setBusy(true);
    setErr(null);
    const r = await decideReviewAction({ requestId, decision: "changes", comments: list });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success(r.message ?? "Sent");
    setMode("done");
    router.refresh();
  };

  if (mode === "done") {
    return (
      <p className="flex items-start gap-2 text-sm text-body">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden /> Sent to {who}. You will get the next draft here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={included} aria-valuenow={Math.min(round, included)} aria-label="Review rounds used">
          <div className="h-full rounded-full bg-act" style={{ width: `${Math.min(100, (round / included) * 100)}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Round {round} of {included} included.{extra ? " Further changes after this round may be quoted." : ""}
        </p>
      </div>

      {mode === "decide" ? (
        <div className="space-y-2">
          <Button variant="primary" className="h-12 w-full" onClick={() => setApproveOpen(true)}>
            Approve draft
          </Button>
          <Button className="w-full" onClick={() => setMode("changes")}>
            Request changes
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-medium text-ink">What should change?</p>
          {comments.map((c, i) => (
            <div key={i} className="space-y-2 rounded-ctl border border-hairline p-3">
              <label className="block text-xs font-medium text-muted" htmlFor={`anchor-${i}`}>
                On (optional: a line, page or section)
              </label>
              <input
                id={`anchor-${i}`}
                value={c.anchor}
                maxLength={200}
                onChange={(e) => setComments((cs) => cs.map((x, j) => (j === i ? { ...x, anchor: e.target.value } : x)))}
                className="h-9 w-full rounded-ctl border border-line-strong bg-paper px-3 text-sm text-ink outline-none focus:border-accent"
              />
              <label className="block text-xs font-medium text-muted" htmlFor={`text-${i}`}>
                Change
              </label>
              <textarea
                id={`text-${i}`}
                value={c.text}
                rows={3}
                maxLength={2000}
                onChange={(e) => setComments((cs) => cs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                className="w-full rounded-ctl border border-line-strong bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
              {comments.length > 1 ? (
                <Button size="sm" variant="ghost" onClick={() => setComments((cs) => cs.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" aria-hidden /> Remove
                </Button>
              ) : null}
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setComments((cs) => [...cs, { anchor: "", text: "" }])} disabled={comments.length >= 30}>
            <Plus className="size-3.5" aria-hidden /> Add another change
          </Button>
          {err ? <p role="alert" className="text-sm text-bad">{err}</p> : null}
          <Button variant="primary" className="w-full" onClick={sendChanges} disabled={busy}>
            {busy ? "Sending…" : `Send changes (uses round ${round})`}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setMode("decide")} disabled={busy}>
            Back
          </Button>
        </div>
      )}

      <ConfirmSheet
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Approve this draft?"
        body={`${who} then prepares the final files. You receive them here, with any balance invoice.`}
        confirmLabel="Approve draft"
        onConfirm={async () => {
          const r = await decideReviewAction({ requestId, decision: "approved", comments: [] });
          if (!r.ok) throw new Error(r.error);
          toast.success(r.message ?? "Approved");
          setMode("done");
          router.refresh();
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Sheet } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { LEGAL_TRANSITIONS, STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";
import { bulkStatusAction } from "@/app/admin/requests/work-actions";
import { cn } from "@/lib/utils";

/** What each move triggers, in words. */
const EFFECT: Partial<Record<RequestStatus, string>> = {
  quote_sent: "Use after the quote has gone out by another route.",
  quote_requested: "Withdraws the quote for revision.",
  pending_payment: "The client is asked to pay the linked invoice.",
  awaiting_documents: "The client is asked for their documents.",
  in_progress: "Work starts, or restarts after the client asked for changes.",
  in_review: "Someone checks the work internally before it goes out.",
  client_review: "Prefer “Send for review” on a draft in Deliverables, which records the round.",
  delivered: "Final files are with the client. Issue the balance invoice from Billing if there is one.",
  completed: "Closes the request. Nothing else is sent.",
  cancelled: "Stops the request before payment. Voids an unpaid invoice. Give a reason.",
  declined: "The firm will not take this on. Give a reason.",
  refunded: "Only after a refund is recorded in Billing. Give a reason.",
};
const NEEDS_REASON = ["cancelled", "declined", "refunded"];

/** Move one or many requests. Only statuses every selected request can legally reach are offered. */
export function MoveSheet({
  open,
  onClose,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  rows: Array<{ id: string; status: string; number: string }>;
}) {
  const toast = useToast();
  const router = useRouter();
  const targets = useMemo(() => {
    if (!rows.length) return [];
    const sets = rows.map((r) => LEGAL_TRANSITIONS[r.status as RequestStatus] ?? []);
    return sets[0].filter((t) => sets.every((s) => s.includes(t)));
  }, [rows]);
  const [to, setTo] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTo(targets[0] ?? "");
      setNote("");
      setErr(null);
    }
  }, [open, targets]);

  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await bulkStatusAction({ ids: rows.map((x) => x.id), to, note: note.trim() || undefined });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success(r.message);
    router.refresh();
    onClose();
  };
  const needsReason = NEEDS_REASON.includes(to);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Move to"
      description={rows.length === 1 ? `${rows[0].number}, now ${STATUS_LABELS[rows[0].status as RequestStatus] ?? rows[0].status}` : `${rows.length} requests`}
      footer={
        targets.length ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant={needsReason ? "danger" : "primary"} onClick={go} disabled={busy || !to || (needsReason && note.trim().length < 3)}>
              {busy ? "Moving…" : `Move to ${STATUS_LABELS[to as RequestStatus] ?? to}`}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      {targets.length === 0 ? (
        <EmptyState compact title="No common next step" why="These requests are at different stages, or closed. Select requests in the same stage to move them together." />
      ) : (
        <div className="space-y-2 text-sm">
          {targets.map((t) => (
            <label key={t} className={cn("flex cursor-pointer gap-3 rounded-ctl border p-3", to === t ? "border-act bg-brand-tint" : "border-hairline hover:bg-surface")}>
              <input type="radio" name="move-to" checked={to === t} onChange={() => setTo(t)} className="mt-1" />
              <span>
                <span className="block font-semibold text-ink">{STATUS_LABELS[t]}</span>
                <span className="block text-body">{EFFECT[t]}</span>
              </span>
            </label>
          ))}
          <label className="block pt-2">
            <span className="mb-1.5 block font-medium text-ink">{needsReason ? "Reason (the client sees it)" : "Note on the timeline (optional, the client sees it)"}</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-ctl border border-line-strong bg-paper px-3 py-2 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <p className="text-muted">Only legal next steps are listed. The server checks the same map, and the client is emailed.</p>
          {err ? <p className="text-bad">{err}</p> : null}
        </div>
      )}
    </Sheet>
  );
}

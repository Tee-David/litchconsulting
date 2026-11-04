"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LifeBuoy, ThumbsUp, XCircle } from "lucide-react";
import { Button, ConfirmSheet, Sheet } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { cancelRequestAction, declineQuoteRequestAction, approveCloseRequestAction } from "../actions";

/**
 * Secondary per-status actions on a request. The primary move (pay, review,
 * upload) lives in the "Your move" card; payment always goes through
 * /dashboard/billing/pay so the deposit and transfer options are offered.
 * Post-payment exits route to support — no self-serve refunds by design.
 */

const REASONS = ["I changed my mind", "I picked the wrong service", "Timing does not work right now", "Cost is higher than expected", "Other"];

export function RequestActions({
  requestId,
  requestNumber,
  status,
  pricingMode,
}: {
  requestId: string;
  requestNumber: string;
  status: string;
  pricingMode: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<"cancel" | "decline" | "close" | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canCancel = ["quote_requested", "quote_sent", "pending_payment"].includes(status);
  const canDecline = pricingMode === "quote" && status === "pending_payment";
  const canClose = status === "delivered";
  const paidStage = !["quote_requested", "quote_sent", "pending_payment", "cancelled", "declined"].includes(status);
  const reasonText = () => (reason === "Other" ? note.trim() : note.trim() ? `${reason}: ${note.trim()}` : reason);

  const submitReason = async () => {
    if (reason === "Other" && !note.trim()) return setErr("Tell us the reason in a few words.");
    setBusy(true);
    setErr(null);
    const res = dialog === "decline" ? await declineQuoteRequestAction(requestId, reasonText()) : await cancelRequestAction(requestId, reasonText());
    setBusy(false);
    if (!res.ok) return setErr(res.error || "That did not work. Try again.");
    toast.success(dialog === "decline" ? `Quote declined on ${requestNumber}` : `${requestNumber} cancelled`);
    setDialog(null);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canClose ? (
        <Button variant="secondary" onClick={() => setDialog("close")}>
          <ThumbsUp className="size-4" aria-hidden /> Confirm and close
        </Button>
      ) : null}
      {canDecline ? (
        <Button variant="ghost" onClick={() => setDialog("decline")}>
          <XCircle className="size-4" aria-hidden /> Decline quote
        </Button>
      ) : canCancel ? (
        <Button variant="ghost" onClick={() => setDialog("cancel")}>
          <XCircle className="size-4" aria-hidden /> Cancel request
        </Button>
      ) : null}
      {paidStage ? (
        <Link
          href={`/dashboard/support?new=true&request=${encodeURIComponent(requestId)}`}
          className="inline-flex h-10 items-center gap-1.5 rounded-ctl px-3 text-sm font-medium text-body hover:bg-surface hover:text-ink"
        >
          <LifeBuoy className="size-4" aria-hidden /> Contact support
        </Link>
      ) : null}

      <ConfirmSheet
        open={dialog === "close"}
        onClose={() => setDialog(null)}
        title="Close this request?"
        body="Confirm you have your final files and are happy with the work. You can still download everything from Files, and request it again later."
        confirmLabel="Confirm and close"
        onConfirm={async () => {
          const r = await approveCloseRequestAction(requestId);
          if (!r.ok) throw new Error(r.error || "Could not close the request.");
          toast.success(`${requestNumber} closed. Thank you.`);
          router.refresh();
        }}
      />

      <Sheet
        open={dialog === "cancel" || dialog === "decline"}
        onClose={() => setDialog(null)}
        dismissible={!busy}
        size="sm"
        title={dialog === "decline" ? "Decline this quote?" : "Cancel this request?"}
        description={dialog === "decline" ? "Telling us why helps us quote better next time." : "This stops the request before any work begins. You can start a new one at any time."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>Keep it</Button>
            <Button variant="danger" onClick={submitReason} disabled={busy}>
              {busy ? "Working…" : dialog === "decline" ? "Decline quote" : "Cancel request"}
            </Button>
          </>
        }
      >
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-ink">Reason</legend>
          {REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-body">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-[var(--color-act)]" />
              {r}
            </label>
          ))}
        </fieldset>
        <label className="mt-4 block text-sm font-medium text-ink" htmlFor="reason-note">
          Anything else? {reason === "Other" ? "(required)" : "(optional)"}
        </label>
        <textarea
          id="reason-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1.5 w-full rounded-ctl border border-line-strong bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        {err ? <p role="alert" className="mt-2 text-sm text-bad">{err}</p> : null}
      </Sheet>
    </div>
  );
}

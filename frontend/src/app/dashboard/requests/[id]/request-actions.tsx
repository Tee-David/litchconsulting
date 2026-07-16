"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, Loader2, XCircle, ThumbsUp, LifeBuoy } from "lucide-react";
import { Modal } from "@/components/admin/ui/modal";
import {
  initRequestPaymentAction,
  cancelRequestAction,
  declineQuoteRequestAction,
  approveCloseRequestAction,
} from "../actions";

/**
 * Per-status client actions on a request (cancel-order inspo: reasons first,
 * then the action). Post-payment exits route to support — no self-serve
 * refunds by design.
 */

const CANCEL_REASONS = [
  "I changed my mind",
  "I picked the wrong service",
  "Timing doesn't work right now",
  "Cost is higher than expected",
  "Other",
];

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
  const [pending, startTransition] = useTransition();
  const [payBusy, setPayBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"cancel" | "decline" | null>(null);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [note, setNote] = useState("");

  const canPay = status === "pending_payment";
  const canCancel = ["quote_requested", "pending_payment"].includes(status);
  const canDecline = pricingMode === "quote" && status === "pending_payment";
  const canApprove = status === "delivered";
  const paidStage = !["quote_requested", "pending_payment", "cancelled", "declined"].includes(status);

  async function pay() {
    setPayBusy(true);
    setError(null);
    const res = await initRequestPaymentAction(requestId);
    if (res.ok && res.payUrl) {
      window.location.assign(res.payUrl);
      return;
    }
    setError(res.error || "Could not start payment.");
    setPayBusy(false);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setDialog(null);
        router.refresh();
      } else {
        setError(res.error || "Something went wrong.");
      }
    });
  }

  const reasonText = () => (reason === "Other" ? note : note ? `${reason} — ${note}` : reason);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {canPay && (
          <button
            type="button"
            onClick={() => void pay()}
            disabled={payBusy}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {payBusy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
            Complete payment
          </button>
        )}
        {canApprove && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => approveCloseRequestAction(requestId))}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ThumbsUp className="size-4" />}
            Approve &amp; close
          </button>
        )}
        {canDecline && (
          <button
            type="button"
            onClick={() => setDialog("decline")}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
          >
            <XCircle className="size-4" /> Decline quote
          </button>
        )}
        {canCancel && !canDecline && (
          <button
            type="button"
            onClick={() => setDialog("cancel")}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper px-4 py-2.5 text-sm font-semibold text-body transition-colors hover:bg-surface"
          >
            <XCircle className="size-4 text-muted" /> Cancel request
          </button>
        )}
        {paidStage && (
          <Link
            href={`/dashboard/support?new=true&request=${encodeURIComponent(requestNumber)}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper px-4 py-2.5 text-sm font-semibold text-body transition-colors hover:bg-surface"
          >
            <LifeBuoy className="size-4 text-muted" /> Contact support
          </Link>
        )}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "decline" ? "Decline this quote?" : "Cancel this request?"}
      >
        <div className="space-y-4">
          <p className="text-sm text-body">
            {dialog === "decline"
              ? "No hard feelings — telling us why helps us quote better next time."
              : "This stops the request before any work begins. You can always start a new one."}
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Choose a reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
            >
              {CANCEL_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">
              Anything else? {dialog === "decline" && reason === "Other" ? "(required)" : "(optional)"}
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="rounded-full border border-hairline bg-paper px-4 py-2 text-sm font-semibold text-body hover:bg-surface"
            >
              Keep it
            </button>
            <button
              type="button"
              disabled={pending || (dialog === "decline" && reason === "Other" && !note.trim())}
              onClick={() =>
                run(() =>
                  dialog === "decline"
                    ? declineQuoteRequestAction(requestId, reasonText())
                    : cancelRequestAction(requestId, reasonText())
                )
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {dialog === "decline" ? "Decline quote" : "Cancel request"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

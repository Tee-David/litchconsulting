"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Check, X, Loader2 } from "lucide-react";
import { PayButton } from "@/components/pay/pay-button";
import { acceptQuoteAction, declineQuoteAction } from "../actions";

type InvoiceDetailClientProps = {
  invoiceId: string;
  kind: "invoice" | "quote";
  status: string;
  publicToken?: string | null;
  invoiceNumber: string;
};

export function InvoiceDetailClient({
  invoiceId,
  kind,
  status,
  publicToken,
  invoiceNumber,
}: InvoiceDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAccept = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await acceptQuoteAction(invoiceId);
      if (res.ok) {
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to accept the quote.");
      }
    });
  };

  const handleDecline = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await declineQuoteAction(invoiceId);
      if (res.ok) {
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to decline the quote.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {errorMessage && (
        <div className="rounded-xl bg-red-500/10 p-3.5 text-sm font-semibold text-red-600 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Quote Acceptance / Decline Actions */}
        {kind === "quote" && status === "sent" && (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={handleAccept}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Accept Quote
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleDecline}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50"
            >
              <X className="size-4" />
              Decline
            </button>
          </>
        )}

        {/* Invoice Payment Action — Paystack checkout via the public token */}
        {kind === "invoice" && ["sent", "overdue"].includes(status) && publicToken && (
          <PayButton token={publicToken} label="Pay Now" />
        )}

        {/* PDF Download Action */}
        <a
          href={`/api/dashboard/invoices/${invoiceId}/pdf`}
          download={`${invoiceNumber}.pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
        >
          <Download className="size-4 text-muted" />
          Download PDF
        </a>

        {/* Receipt Download Action */}
        {kind === "invoice" && status === "paid" && (
          <a
            href={`/api/dashboard/invoices/${invoiceId}/pdf?variant=receipt`}
            download={`receipt-${invoiceNumber}.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper px-4 py-2 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
          >
            <Download className="size-4 text-emerald-500" />
            Download Receipt
          </a>
        )}
      </div>
    </div>
  );
}

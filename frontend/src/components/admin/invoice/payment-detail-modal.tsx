"use client";

import { Copy, ExternalLink } from "lucide-react";
import { Modal } from "@/components/admin/ui/modal";
import { Badge, type BadgeTone } from "@/components/admin/ui/badge";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney, num } from "@/lib/invoice/money";
import { formatDateTime } from "@/lib/format-date";
import { formatPaymentMethod, formatPaymentStatus } from "@/lib/payments/format";

export type PaymentView = {
  id: string;
  provider: string;
  status: string;
  reference: string;
  amount: string;
  amountSettled: string | null;
  currency: string;
  channel: string | null;
  paystackId: string | null;
  note: string | null;
  paidAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  meta: {
    gatewayResponse?: string;
    bank?: string;
    cardType?: string;
    last4?: string;
    customerEmail?: string;
    fees?: number;
  } | null;
};

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "success":
      return "success";
    case "failed":
    case "flagged_amount_mismatch":
    case "duplicate_success":
      return "danger";
    case "abandoned":
    case "initialized":
      return "warning";
    default:
      return "neutral";
  }
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={`min-w-0 break-words text-right text-sm text-ink ${mono ? "font-mono text-[13px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Full detail for a single payment — the reconciliation view. For a Paystack
 * charge it surfaces the transaction reference, channel, gateway response, card
 * / bank and the Paystack id so the admin can trace or check status; for a
 * manual record it shows the note. Read-only: corrections happen by removing a
 * manual row, never by editing a real Paystack record.
 */
export function PaymentDetailModal({
  payment,
  onClose,
}: {
  payment: PaymentView | null;
  onClose: () => void;
}) {
  const toast = useToast();
  if (!payment) return null;
  const p = payment;
  const settled = num(p.amountSettled ?? p.amount);
  const isPaystack = p.provider === "paystack";

  const copy = (v: string, label: string) => {
    void navigator.clipboard.writeText(v);
    toast.success(`${label} copied`);
  };

  return (
    <Modal open={!!payment} onClose={onClose} title="Payment details" size="md">
      <div className="space-y-4">
        {/* Headline */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface/40 p-4">
          <div>
            <p className="font-display text-2xl font-bold tabular-nums text-ink">
              {formatMoney(settled, p.currency)}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatPaymentMethod(p.channel || p.provider)} ·{" "}
              {p.provider === "manual" ? "Recorded manually" : "Paystack"}
            </p>
          </div>
          <Badge tone={statusTone(p.status)}>{formatPaymentStatus(p.status)}</Badge>
        </div>

        {/* Core fields */}
        <div className="divide-y divide-hairline">
          <Row label="Reference" value={p.reference} mono />
          <Row label="Method" value={formatPaymentMethod(p.channel || p.provider)} />
          {p.paidAt && <Row label="Paid" value={formatDateTime(p.paidAt)} />}
          <Row label="Recorded" value={formatDateTime(p.createdAt)} />
          {p.verifiedAt && <Row label="Verified" value={formatDateTime(p.verifiedAt)} />}

          {/* Paystack-only trace fields */}
          {isPaystack && p.paystackId && <Row label="Paystack ID" value={p.paystackId} mono />}
          {isPaystack && p.meta?.gatewayResponse && (
            <Row label="Gateway response" value={p.meta.gatewayResponse} />
          )}
          {isPaystack && p.meta?.bank && <Row label="Bank" value={p.meta.bank} />}
          {isPaystack && (p.meta?.cardType || p.meta?.last4) && (
            <Row
              label="Card"
              value={[p.meta.cardType, p.meta.last4 ? `•••• ${p.meta.last4}` : ""].filter(Boolean).join(" ")}
            />
          )}
          {isPaystack && p.meta?.customerEmail && <Row label="Customer" value={p.meta.customerEmail} />}
          {isPaystack && p.meta?.fees != null && (
            <Row label="Paystack fee" value={formatMoney(p.meta.fees, p.currency)} />
          )}

          {p.note && <Row label="Note" value={p.note} />}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <button
            type="button"
            onClick={() => copy(p.reference, "Reference")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-surface hover:text-ink"
          >
            <Copy className="size-3.5" /> Copy reference
          </button>
          {isPaystack && p.reference && (
            <a
              href={`https://dashboard.paystack.com/#/transactions?query=${encodeURIComponent(p.reference)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-surface hover:text-ink"
            >
              <ExternalLink className="size-3.5" /> View on Paystack
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

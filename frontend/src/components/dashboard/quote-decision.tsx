"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button, Sheet } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { cn } from "@/lib/utils";
import { acceptQuoteOneClickAction, declineQuoteAction } from "@/app/dashboard/billing/actions";

const REASONS = ["The price is higher than expected", "We chose another firm", "We no longer need it", "The timing does not work", "Other"];

/** One-click accept (full or deposit) beside the quote, with a decline sheet. */
export function QuoteDecision({
  quoteId,
  total,
  deposit,
  depositPercent,
  askHref,
}: {
  quoteId: string;
  total: string;
  deposit: string | null;
  depositPercent: number | null;
  askHref: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [plan, setPlan] = useState<"deposit" | "full">(deposit ? "deposit" : "full");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<{ invoiceId: string; invoiceNumber: string } | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");

  const accept = async () => {
    setBusy(true);
    setErr(null);
    const r = await acceptQuoteOneClickAction(quoteId, plan);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setAccepted({ invoiceId: r.invoiceId, invoiceNumber: r.invoiceNumber });
    toast.success(`Quote accepted. Invoice ${r.invoiceNumber} is ready.`);
    router.refresh();
  };

  const decline = async () => {
    const text = reason === "Other" ? note.trim() : note.trim() ? `${reason}: ${note.trim()}` : reason;
    if (!text) return setErr("Tell us why in a few words.");
    setBusy(true);
    setErr(null);
    const r = await declineQuoteAction(quoteId, text);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setDeclining(false);
    toast.success("Quote declined. Thank you for telling us why.");
    router.refresh();
  };

  if (accepted) {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-body">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" aria-hidden />
          <span>
            <b className="text-ink">Accepted.</b> Invoice {accepted.invoiceNumber} is ready. Work starts when it is paid.
          </span>
        </p>
        <Link href={`/dashboard/billing/pay?invoice=${accepted.invoiceId}`} className="inline-flex h-11 w-full items-center justify-center rounded-ctl bg-act text-sm font-semibold text-act-ink hover:bg-act-hover">
          {plan === "deposit" && deposit ? `Pay deposit ${deposit}` : `Pay ${total}`}
        </Link>
        <Link href="/dashboard" className="inline-flex h-10 w-full items-center justify-center rounded-ctl border border-line-strong text-sm font-medium text-ink hover:bg-surface">
          Pay later
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {deposit ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">How would you like to pay?</legend>
          {(
            [
              ["deposit", `${depositPercent}% deposit now`, `${deposit} now, the rest on delivery`],
              ["full", "Pay in full", `${total} now`],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className={cn("mb-2 flex cursor-pointer gap-3 rounded-ctl border p-3", plan === id ? "border-act bg-brand-tint" : "border-hairline hover:bg-surface")}>
              <input type="radio" name="plan" value={id} checked={plan === id} onChange={() => setPlan(id)} className="mt-1 size-4 accent-[var(--color-act)]" />
              <span>
                <b className="block text-sm text-ink">{label}</b>
                <span className="text-sm text-body">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {err ? <p role="alert" className="text-sm text-bad">{err}</p> : null}
      <Button variant="primary" className="h-12 w-full" onClick={accept} disabled={busy}>
        {busy ? "Accepting…" : "Accept quote"}
      </Button>
      <div className="flex gap-2">
        <Link href={askHref} className="inline-flex h-10 flex-1 items-center justify-center rounded-ctl border border-line-strong text-sm font-medium text-ink hover:bg-surface">
          Ask a question
        </Link>
        <Button variant="ghost" className="flex-1" onClick={() => setDeclining(true)} disabled={busy}>
          Decline
        </Button>
      </div>
      <p className="text-xs text-muted">Accepting creates your invoice and pay link. Nothing is charged until you pay.</p>

      <Sheet
        open={declining}
        onClose={() => setDeclining(false)}
        dismissible={!busy}
        size="sm"
        title="Decline this quote?"
        description="Telling us why helps us quote better. The request closes; you can start a new one any time."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(false)} disabled={busy}>Keep it</Button>
            <Button variant="danger" onClick={decline} disabled={busy}>{busy ? "Working…" : "Decline quote"}</Button>
          </>
        }
      >
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-ink">Reason</legend>
          {REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-body">
              <input type="radio" name="decline-reason" checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-[var(--color-act)]" />
              {r}
            </label>
          ))}
        </fieldset>
        <label htmlFor="decline-note" className="mt-4 block text-sm font-medium text-ink">
          Anything else? {reason === "Other" ? "(required)" : "(optional)"}
        </label>
        <textarea id="decline-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full rounded-ctl border border-line-strong bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
        {err ? <p role="alert" className="mt-2 text-sm text-bad">{err}</p> : null}
      </Sheet>
    </div>
  );
}

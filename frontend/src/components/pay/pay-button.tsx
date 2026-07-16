"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

/**
 * "Pay securely" button — starts a Paystack checkout for an invoice via its
 * public token and redirects to the hosted payment page. Used on the public
 * /i/[token] page and the client dashboard invoice/request views.
 */
export function PayButton({
  token,
  label = "Pay securely with Paystack",
  className,
}: {
  token: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pay/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (body.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      setError(body.error || "Could not start payment. Please try again.");
    } catch {
      setError("Could not start payment. Please check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        {busy ? "Starting secure checkout…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

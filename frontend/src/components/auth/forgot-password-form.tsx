"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/admin/ui/toaster";
import { AuthHeading, Field, SubmitButton } from "./ui";

/**
 * Forgot password (R1.1): ask → sent. The "sent" message is identical whether
 * or not the address has an account (no account enumeration).
 */
export function ForgotPasswordForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter the email you sign in with.");
    setBusy(true);
    const { error: err } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
    setBusy(false);
    if (err?.status === 429) return setError("Too many requests from this connection. Wait a little and try again.");
    // Any other outcome reads the same, on purpose.
    if (sent) toast.success("If the email has an account, a new link is on its way.");
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <AuthHeading
          icon={<Mail />}
          title="Check your email"
          lede={
            <>
              If <b className="font-semibold text-ink">{email.trim()}</b> has an account, a link is on its way. It works once, for 1 hour.
            </>
          }
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-ctl border border-line-strong bg-paper px-3.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send again"}
          </button>
          <Link href="/login" className="inline-flex h-10 items-center rounded-ctl px-3.5 text-sm font-medium text-body hover:bg-surface hover:text-ink">
            Back to sign in
          </Link>
        </div>
        {error ? <p role="alert" className="text-sm font-medium text-bad">{error}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-5" noValidate>
      <AuthHeading icon={<KeyRound />} title="Reset your password" lede="Enter the email you sign in with. If it has an account, we send a link that works once, for 1 hour." />
      <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={error} placeholder="you@company.com" />
      <SubmitButton busy={busy} busyLabel="Sending…">
        Send reset link
      </SubmitButton>
      <Link href="/login" className="text-sm font-medium text-accent hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}

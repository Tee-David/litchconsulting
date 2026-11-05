"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clock, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { continueUrl } from "@/lib/post-auth";
import { useToast } from "@/components/admin/ui/toaster";
import { AuthHeading, Field, SubmitButton, authErrorText, maskEmail } from "./ui";

/**
 * /verify-email (R1.1). Successful links never land here: they sign the
 * person in and go through /account/continue (which also continues a saved
 * request). This page is for "check your inbox" and for a link that expired
 * or was already used — with a fresh link in place.
 */
export function VerifyEmailForm({ knownEmail }: { knownEmail: string | null }) {
  const params = useSearchParams();
  const toast = useToast();
  const expired = params.get("error") === "link";
  const [email, setEmail] = useState(knownEmail ?? params.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter the email you signed up with.");
    setBusy(true);
    const { error: err } = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: `${window.location.origin}${continueUrl(null)}` });
    setBusy(false);
    if (err) return setError(authErrorText(err, "We could not send a link. Try again in a few minutes."));
    setSent(true);
    toast.success(`If ${maskEmail(email.trim())} has an unverified account, a new link is on its way.`);
  }

  return (
    <div className="flex flex-col gap-5">
      <AuthHeading
        icon={expired ? <Clock /> : <Mail />}
        tone={expired ? "warn" : "info"}
        title={expired ? "This link has expired" : "Confirm your email"}
        lede={
          expired
            ? "Verification links work once, for 1 hour. Get a fresh one below; the old one stops working."
            : "We sent a confirmation link when you created your account. Open it on any device to continue."
        }
      />
      {sent ? (
        <p className="rounded-card border border-hairline bg-paper px-4 py-3 text-sm text-body" role="status">
          Sent. Check your inbox (and spam) for an email from Litch Consulting.
        </p>
      ) : null}
      <form onSubmit={send} className="flex flex-col gap-4" noValidate>
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={Boolean(knownEmail)} error={error} />
        <SubmitButton busy={busy} busyLabel="Sending…">
          {sent ? "Send again" : "Send a new link"}
        </SubmitButton>
      </form>
      <p className="text-sm text-body">
        Already confirmed?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

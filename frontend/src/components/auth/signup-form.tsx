"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Mail, ShieldCheck } from "lucide-react";
import { authClient, signIn, signUp } from "@/lib/auth-client";
import { isDisposableEmail } from "@/lib/block-disposable-email";
import { continueUrl } from "@/lib/post-auth";
import { useToast } from "@/components/admin/ui/toaster";
import { Turnstile, type TurnstileHandle } from "@/components/ui/turnstile";
import { prepareSignupAction } from "@/app/get-started/actions";
import { PasswordStrength, passwordIssue } from "./password-strength";
import { AuthHeading, Callout, Check, Field, GoogleButton, OrDivider, SubmitButton, authErrorText } from "./ui";

/**
 * Create an account (R1.1 + R1.6). The chosen service (if any) is already a
 * server-side draft; before the account is made we add the email and company
 * to it, and the draft id rides in the verification link, so verifying on a
 * phone still lands on the pre-filled request.
 */
export function SignupForm({ draftId: initialDraft, serviceName, googleEnabled }: { draftId: string | null; serviceName: string | null; googleEnabled: boolean }) {
  const toast = useToast();
  const params = useSearchParams();
  const redirect = params.get("redirect");
  const ts = useRef<TurnstileHandle>(null);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; consent?: string; form?: string }>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(initialDraft);
  const [resending, setResending] = useState(false);

  const callbackFor = (id: string | null) => `${window.location.origin}${continueUrl(redirect, { draft: id })}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter a valid email address.";
    else if (isDisposableEmail(email)) next.email = "Use a permanent email address; we send your quotes and files there.";
    const pwIssue = passwordIssue(password);
    if (pwIssue) next.password = pwIssue;
    if (!consent) next.consent = "Tick the box to agree to the terms and privacy notice.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const prep = await prepareSignupAction({ email: email.trim(), company: company.trim() || undefined, draftId: draftId ?? undefined, turnstileToken: token ?? undefined });
    if (!prep.ok) {
      setBusy(false);
      ts.current?.reset();
      setErrors({ form: prep.error });
      return;
    }
    setDraftId(prep.draftId);
    // role is never sent: the server always makes a client.
    const { error } = await signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: callbackFor(prep.draftId) });
    setBusy(false);
    if (error) {
      const msg = authErrorText(error, "We could not create your account. Try again.");
      if (error.code === "PASSWORD_BREACHED" || error.code === "PASSWORD_TOO_SHORT") setErrors({ password: msg });
      else if (/exist/i.test(error.code ?? "")) setErrors({ email: msg });
      else setErrors({ form: msg });
      return;
    }
    setSentTo(email.trim());
  }

  async function resend() {
    if (!sentTo) return;
    setResending(true);
    const { error } = await authClient.sendVerificationEmail({ email: sentTo, callbackURL: callbackFor(draftId) });
    setResending(false);
    if (error) return toast.error(authErrorText(error, "We could not send a new link. Try again in a few minutes."));
    toast.success("New link sent. The old one stops working.");
  }

  function google() {
    setGoogleBusy(true);
    void signIn.social({ provider: "google", callbackURL: continueUrl(redirect, { draft: draftId }), errorCallbackURL: "/login" }).catch(() => {
      setGoogleBusy(false);
      toast.error("Google sign-up could not start. Try again.");
    });
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-5">
        <AuthHeading
          icon={<Mail />}
          title="Check your email"
          lede={
            <>
              We sent a link to <b className="font-semibold text-ink">{sentTo}</b>. Open it on any device.
              {serviceName ? (
                <>
                  {" "}
                  Your request for <b className="font-semibold text-ink">{serviceName}</b> is saved and waits for you.
                </>
              ) : null}
            </>
          }
        />
        <Callout tone="good" icon={<ShieldCheck />}>
          The link works for 1 hour. Once you confirm, you are signed in and taken straight on.
        </Callout>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="inline-flex h-10 items-center rounded-ctl border border-line-strong bg-paper px-3.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
          >
            {resending ? "Sending…" : "Resend link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setPassword("");
            }}
            className="inline-flex h-10 items-center rounded-ctl px-3.5 text-sm font-medium text-body hover:bg-surface hover:text-ink"
          >
            Change email
          </button>
        </div>
        <p className="text-[13px] text-muted">Not there after 2 minutes? Check spam, or resend.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AuthHeading title="Create your Litch account" lede="For clients of Litch Consulting. Staff and colleagues join from an invitation email." />

      {serviceName ? (
        <Callout icon={<FileText />} title={`You are requesting: ${serviceName}`}>
          Saved as a draft on our side. It survives verifying your email on another device.{" "}
          <Link href="/get-started" className="font-medium text-accent hover:underline">
            Change
          </Link>
        </Callout>
      ) : null}

      {googleEnabled ? (
        <>
          <GoogleButton onClick={google} label="Sign up with Google" busy={googleBusy} disabled={busy} />
          <OrDivider />
        </>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <Field label="Company" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} hint="Optional" />
        </div>
        <Field label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="you@company.com" />
        <div className="space-y-2">
          <Field label="Password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
          <PasswordStrength password={password} forbidden={[name, email.split("@")[0]]} />
          {password ? <p className="text-[12.5px] text-muted">Checked against known leaked passwords when you submit.</p> : null}
        </div>
        <div className="space-y-1">
          <Check checked={consent} onChange={setConsent}>
            I agree to the{" "}
            <Link href="/legal/terms-and-conditions" target="_blank" className="font-medium text-accent hover:underline">
              terms
            </Link>{" "}
            and the{" "}
            <Link href="/legal/privacy-policy" target="_blank" className="font-medium text-accent hover:underline">
              privacy notice
            </Link>{" "}
            (NDPA 2023).
          </Check>
          {errors.consent ? (
            <p role="alert" className="pl-6 text-[13px] font-medium text-bad">
              {errors.consent}
            </p>
          ) : null}
        </div>
        <Turnstile ref={ts} onToken={setToken} action="signup" />
        {errors.form ? (
          <Callout tone="bad" role="alert">
            {errors.form}
          </Callout>
        ) : null}
        <SubmitButton busy={busy} busyLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>

      <p className="text-sm text-body">
        Already have an account?{" "}
        <Link href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login"} className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

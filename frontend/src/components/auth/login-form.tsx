"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound, Mail } from "lucide-react";
import { authClient, signIn } from "@/lib/auth-client";
import { continueUrl } from "@/lib/post-auth";
import { useToast } from "@/components/admin/ui/toaster";
import { AuthHeading, Callout, Check, Field, GoogleButton, OrDivider, SubmitButton, authErrorText, maskEmail } from "./ui";

type Stage = "form" | "code";

const OAUTH_ERRORS: Record<string, string> = {
  account_not_linked: "That Google account could not be linked: its address is not verified with Google, or it differs from your Litch email. Sign in with your password.",
  ACCOUNT_SUSPENDED: "This account is suspended. Contact Litch Consulting if you think this is a mistake.",
  access_denied: "Google sign-in was cancelled.",
};

/**
 * Sign in (R1.1): Google first, then email + password. Named states for a
 * wrong password, an unverified email (with a resend), a suspended account,
 * and the two-step code when the account has an authenticator. Every
 * success goes through /account/continue, which picks the right door.
 */
export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const toast = useToast();
  const params = useSearchParams();
  const redirect = params.get("redirect");
  const banned = params.get("banned") === "1";
  const oauthError = params.get("error");
  const next = continueUrl(redirect);

  const [stage, setStage] = useState<Stage>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [trust, setTrust] = useState(true);
  const codeRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setBusy(true);
    const { data, error: err } = await signIn.email({ email: email.trim(), password, rememberMe: remember, callbackURL: next });
    setBusy(false);
    if (err) {
      if (err.status === 403 && (err.code === "EMAIL_NOT_VERIFIED" || /verif/i.test(err.message ?? ""))) {
        setUnverified(true);
        return;
      }
      setError(authErrorText(err, "Sign-in did not work. Try again."));
      return;
    }
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setStage("code");
      setTimeout(() => codeRef.current?.focus(), 50);
      return;
    }
    // Hard navigation so the fresh session cookie rides on the next request.
    window.location.href = next;
  }

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = useBackup ? code.trim() : code.replace(/\D/g, "");
    if (!useBackup && clean.length !== 6) return setError("Enter the 6 digits from your authenticator app.");
    if (useBackup && clean.length < 6) return setError("Enter one of your backup codes.");
    setBusy(true);
    const res = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: clean, trustDevice: trust })
      : await authClient.twoFactor.verifyTotp({ code: clean, trustDevice: trust });
    setBusy(false);
    if (res.error) {
      setError(authErrorText(res.error, "That code did not work. Try again."));
      if (res.error.code === "INVALID_TWO_FACTOR_COOKIE" || res.error.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE") setStage("form");
      return;
    }
    window.location.href = next;
  }

  async function resend() {
    setResending(true);
    const { error: err } = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: next });
    setResending(false);
    if (err) return toast.error(authErrorText(err, "We could not send a new link. Try again in a few minutes."));
    toast.success(`New link sent to ${maskEmail(email.trim())}. Check spam if it is not there in 2 minutes.`);
  }

  function google() {
    setGoogleBusy(true);
    void signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/login" }).catch(() => {
      setGoogleBusy(false);
      toast.error("Google sign-in could not start. Try again.");
    });
  }

  if (stage === "code") {
    return (
      <form onSubmit={onCode} className="flex flex-col gap-5" noValidate>
        <AuthHeading
          icon={<KeyRound />}
          title={useBackup ? "Use a backup code" : "Enter your 6-digit code"}
          lede={useBackup ? "Each backup code works once. You got ten when you set up two-step sign-in." : "Open your authenticator app and enter the code for Litch Consulting."}
        />
        <Field
          ref={codeRef}
          label={useBackup ? "Backup code" : "Code"}
          inputMode={useBackup ? "text" : "numeric"}
          autoComplete="one-time-code"
          maxLength={useBackup ? 24 : 6}
          value={code}
          onChange={(e) => setCode(useBackup ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6))}
          className={useBackup ? undefined : "text-center font-display text-2xl tracking-[0.5em]"}
          error={error}
          required
        />
        <Check checked={trust} onChange={setTrust}>
          Trust this device for 30 days
        </Check>
        <SubmitButton busy={busy} busyLabel="Checking…">
          Verify and sign in
        </SubmitButton>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            className="font-medium text-accent hover:underline"
            onClick={() => {
              setUseBackup((b) => !b);
              setCode("");
              setError(null);
            }}
          >
            {useBackup ? "Use my authenticator app" : "Use a backup code instead"}
          </button>
          <button type="button" className="text-muted hover:text-ink" onClick={() => setStage("form")}>
            Back
          </button>
        </div>
        <p className="text-[13px] text-muted">Lost your phone and your backup codes? An Admin can reset two-step sign-in for you from Team and access.</p>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AuthHeading title="Sign in to Litch" lede="Clients, staff and Admin all sign in here. You land on your own dashboard." />

      {banned || oauthError === "ACCOUNT_SUSPENDED" ? (
        <Callout tone="bad" role="alert" title="This account is suspended">
          You cannot sign in right now. Contact Litch Consulting at info@litchconsulting.com if you think this is a mistake.
        </Callout>
      ) : oauthError ? (
        <Callout tone="warn" role="alert" title="Google sign-in did not finish">
          {OAUTH_ERRORS[oauthError] ?? "Try again, or sign in with your email and password."}
        </Callout>
      ) : null}

      {unverified ? (
        <Callout tone="warn" role="alert" icon={<Mail />} title="Verify your email first">
          <p>We sent a link to {maskEmail(email.trim())}. It works for 1 hour; open it on any device.</p>
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="mt-2 inline-flex h-9 items-center rounded-ctl border border-line-strong bg-paper px-3 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
          >
            {resending ? "Sending…" : "Send a new link"}
          </button>
        </Callout>
      ) : null}

      {googleEnabled ? (
        <>
          <GoogleButton onClick={google} label="Continue with Google" busy={googleBusy} disabled={busy} />
          <OrDivider />
        </>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          aside={
            <Link href="/forgot-password" className="text-[13px] font-medium text-accent hover:underline">
              Forgot password?
            </Link>
          }
        />
        <Check checked={remember} onChange={setRemember}>
          Keep me signed in on this device
        </Check>
        <SubmitButton busy={busy} busyLabel="Signing in…" disabled={!email || !password}>
          Sign in
        </SubmitButton>
      </form>

      <p className="text-sm text-body">
        New to Litch?{" "}
        <Link href={redirect ? `/signup?redirect=${encodeURIComponent(redirect)}` : "/signup"} className="font-medium text-accent hover:underline">
          Create an account
        </Link>
        . Got an invitation? Use the link in the email.
      </p>
    </div>
  );
}

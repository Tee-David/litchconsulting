"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { continueUrl } from "@/lib/post-auth";
import { useToast } from "@/components/admin/ui/toaster";
import { acceptInvitationAction } from "@/app/invite/[token]/actions";
import { PasswordStrength, passwordIssue } from "./password-strength";
import { AuthHeading, Callout, Field, GoogleButton, OrDivider, SubmitButton, authErrorText } from "./ui";

/**
 * Accept an invitation: your name and a password (or Google, using the
 * invited address). The email is fixed by the invitation. Once the account
 * exists we sign straight in and /account/continue takes over (two-step
 * setup first for firm accounts, then the welcome).
 */
export function InviteAcceptForm({
  token,
  email,
  inviter,
  roleText,
  roleHint,
  company,
  message,
  expiresAt,
  firm,
  googleEnabled,
}: {
  token: string;
  email: string;
  inviter: string;
  roleText: string;
  roleHint: string | null;
  company: string | null;
  message: string | null;
  expiresAt: string;
  firm: boolean;
  googleEnabled: boolean;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; password?: string; form?: string }>({});
  const next = continueUrl(null);
  const expires = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(new Date(expiresAt));

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (name.trim().length < 2) errs.name = "Enter your full name.";
    const issue = passwordIssue(password);
    if (issue) errs.password = issue;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const r = await acceptInvitationAction({ token, name: name.trim(), password });
    if (!r.ok) {
      setBusy(false);
      if (r.reason === "weak-password" || r.reason === "breached-password") setErrors({ password: r.error });
      else setErrors({ form: r.error });
      return;
    }
    const { error } = await signIn.email({ email, password, callbackURL: next });
    if (error) {
      setBusy(false);
      toast.toast("Your account is ready. Sign in to continue.");
      window.location.href = "/login";
      return;
    }
    window.location.href = next;
  }

  async function google() {
    if (name.trim().length < 2) return setErrors({ name: "Enter your full name first." });
    setGoogleBusy(true);
    const r = await acceptInvitationAction({ token, name: name.trim(), password: null });
    if (!r.ok) {
      setGoogleBusy(false);
      return setErrors({ form: r.error });
    }
    // The account exists for this email; Google links to it on sign-in.
    void signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/login" }).catch(() => {
      setGoogleBusy(false);
      toast.error(authErrorText(null, "Google sign-in could not start. Your account is ready; sign in from the sign-in page."));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <AuthHeading
        icon={<UserPlus />}
        title={company ? `Join ${company} on Litch` : "Join Litch Consulting"}
        lede={`${inviter} invited you as ${roleText}. The link works until ${expires}.`}
      />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-card border border-hairline bg-paper px-4 py-3 text-sm">
        <dt className="text-muted">Email</dt>
        <dd className="truncate font-medium text-ink">{email}</dd>
        <dt className="text-muted">Role</dt>
        <dd className="text-ink">
          {roleText}
          {roleHint ? <span className="block text-[13px] text-muted">{roleHint}</span> : null}
        </dd>
      </dl>
      {message ? (
        <blockquote className="border-l-2 border-hairline pl-3 text-sm italic text-body">
          “{message}” <span className="not-italic text-muted">— {inviter}</span>
        </blockquote>
      ) : null}
      {firm ? (
        <Callout tone="info" title="Two-step sign-in comes next">
          Firm accounts confirm sign-ins with a code from an authenticator app. Have your phone ready.
        </Callout>
      ) : null}

      <form onSubmit={accept} className="flex flex-col gap-4" noValidate>
        <Field label="Your full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        {googleEnabled ? (
          <>
            <GoogleButton onClick={google} label={`Continue with Google as ${email}`} busy={googleBusy} disabled={busy} />
            <OrDivider label="or choose a password" />
          </>
        ) : null}
        <div className="space-y-2">
          <Field label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
          <PasswordStrength password={password} forbidden={[name, email.split("@")[0]]} />
        </div>
        {errors.form ? (
          <Callout tone="bad" role="alert">
            {errors.form}
          </Callout>
        ) : null}
        <SubmitButton busy={busy} busyLabel="Setting up…" disabled={googleBusy}>
          Accept and create account
        </SubmitButton>
      </form>
      <p className="text-[13px] text-muted">Not you, or not expecting this? Ignore it: nothing is created until you accept.</p>
    </div>
  );
}

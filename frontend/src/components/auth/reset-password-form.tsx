"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, KeyRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { PasswordStrength, passwordIssue } from "./password-strength";
import { AuthHeading, Callout, Field, SubmitButton, authErrorText } from "./ui";

/**
 * Choose a new password (R1.1): new → done, or a named "link expired" state.
 * A reset signs the account out on every device (revokeSessionsOnPasswordReset)
 * and a security notice email follows.
 */
export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [expired, setExpired] = useState(!token || Boolean(linkError));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const issue = passwordIssue(password);
    const next: typeof errors = {};
    if (issue) next.password = issue;
    if (password !== confirm) next.confirm = "The two passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length || !token) return;
    setBusy(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) {
      if (error.code === "INVALID_TOKEN" || /token/i.test(error.message ?? "")) return setExpired(true);
      if (error.code === "PASSWORD_BREACHED") return setErrors({ password: authErrorText(error, "") });
      return setErrors({ form: authErrorText(error, "Your password was not changed. Try again.") });
    }
    setDone(true);
  }

  if (expired) {
    return (
      <div className="flex flex-col gap-5">
        <AuthHeading icon={<Clock />} tone="warn" title="This link has expired" lede="Reset links work once, for 1 hour. Ask for a new one; it takes a few seconds." />
        <Link href="/forgot-password" className="keep-brand inline-flex h-11 items-center justify-center rounded-ctl bg-act px-4 text-[15px] font-semibold text-act-ink hover:bg-act-hover">
          Send a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <AuthHeading
          icon={<CheckCircle2 />}
          tone="good"
          title="Password changed"
          lede="You are signed out on every device, including this one, in case someone else had the old password. We emailed you a note in case this was not you."
        />
        <Link href="/login" className="keep-brand inline-flex h-11 items-center justify-center rounded-ctl bg-act px-4 text-[15px] font-semibold text-act-ink hover:bg-act-hover">
          Sign in with the new password
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <AuthHeading icon={<KeyRound />} title="Choose a new password" lede="Use one you do not use anywhere else." />
      <div className="space-y-2">
        <Field label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <PasswordStrength password={password} />
      </div>
      <Field label="Type it again" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      <p className="text-[13px] text-muted">Saving signs you out on every other device too.</p>
      {errors.form ? (
        <Callout tone="bad" role="alert">
          {errors.form}
        </Callout>
      ) : null}
      <SubmitButton busy={busy} busyLabel="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}

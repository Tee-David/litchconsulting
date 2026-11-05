"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Field, SubmitButton, authErrorText } from "./ui";

/** Code entry for a signed-in session that still needs its second factor. */
export function TwoStepVerify({ done }: { done: string }) {
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), [backup]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = backup ? code.trim() : code.replace(/\D/g, "");
    if (!backup && clean.length !== 6) return setError("Enter the 6 digits from your authenticator app.");
    if (backup && clean.length < 6) return setError("Enter one of your backup codes.");
    setBusy(true);
    const res = backup ? await authClient.twoFactor.verifyBackupCode({ code: clean }) : await authClient.twoFactor.verifyTotp({ code: clean });
    setBusy(false);
    if (res.error) return setError(authErrorText(res.error, "That code did not work."));
    window.location.href = done;
  }

  return (
    <div className="mx-auto max-w-md rounded-card border border-hairline bg-paper p-5 sm:p-7">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-tint text-accent">
            <KeyRound className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-[1.45rem] font-bold leading-tight text-ink">{backup ? "Use a backup code" : "Enter your 6-digit code"}</h1>
            <p className="mt-1 text-[15px] text-body">Firm accounts confirm each new sign-in with a code from the authenticator app.</p>
          </div>
        </div>
        <Field
          ref={ref}
          label={backup ? "Backup code" : "Code"}
          inputMode={backup ? "text" : "numeric"}
          autoComplete="one-time-code"
          maxLength={backup ? 24 : 6}
          value={code}
          onChange={(e) => setCode(backup ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6))}
          className={backup ? undefined : "text-center font-display text-2xl tracking-[0.5em]"}
          error={error}
        />
        <SubmitButton busy={busy} busyLabel="Checking…">
          Verify
        </SubmitButton>
        <button
          type="button"
          className="self-start text-sm font-medium text-accent hover:underline"
          onClick={() => {
            setBackup((b) => !b);
            setCode("");
            setError(null);
          }}
        >
          {backup ? "Use my authenticator app" : "Use a backup code instead"}
        </button>
        <p className="text-[13px] text-muted">No phone and no backup codes? Ask an Admin to reset your two-step sign-in from Team and access, then sign in again.</p>
      </form>
    </div>
  );
}

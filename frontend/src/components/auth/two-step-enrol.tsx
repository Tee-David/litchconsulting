"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/admin/ui/toaster";
import { twoStepChangedAction } from "@/app/account/actions";
import { Callout, Check, Field, SubmitButton, authErrorText } from "./ui";
import { cn } from "@/lib/utils";

type Step = "start" | "scan" | "codes";

/**
 * Two-step enrolment, three steps: (1) confirm it's you (password, when the
 * account has one), (2) scan the QR code and type the first code, (3) save the
 * ten backup codes — shown ONCE, never again.
 */
export function TwoStepEnrol({ required, needsPassword, email, done }: { required: boolean; needsPassword: boolean; email: string; done: string }) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("start");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const secret = uri ? new URL(uri).searchParams.get("secret") : null;

  useEffect(() => {
    if (!uri) return;
    QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [uri]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsPassword && !password) return setError("Enter your password to continue.");
    setBusy(true);
    const { data, error: err } = await authClient.twoFactor.enable(needsPassword ? { password } : ({} as { password: string }));
    setBusy(false);
    if (err || !data) return setError(authErrorText(err, "We could not start two-step setup. Try again."));
    setUri(data.totpURI);
    setCodes(data.backupCodes ?? []);
    setStep("scan");
    setTimeout(() => codeRef.current?.focus(), 80);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) return setError("Enter the 6 digits your app shows for Litch Consulting.");
    setBusy(true);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code: clean });
    setBusy(false);
    if (err) return setError(authErrorText(err, "That code did not work. Try the one showing now."));
    void twoStepChangedAction("enabled");
    setStep("codes");
  }

  function copyCodes() {
    void navigator.clipboard?.writeText(codes.join("\n")).then(
      () => toast.success("Backup codes copied."),
      () => toast.error("Copy did not work. Download them instead."),
    );
  }

  function downloadCodes() {
    const blob = new Blob([`Litch Consulting backup codes for ${email}\nEach code works once.\n\n${codes.join("\n")}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "litch-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const steps = [
    { id: "start", label: "Confirm it's you" },
    { id: "scan", label: "Connect your app" },
    { id: "codes", label: "Save backup codes" },
  ] as const;
  const at = steps.findIndex((s) => s.id === step);

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-card border border-hairline bg-paper p-5 sm:p-7">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-tint text-accent">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-[1.45rem] font-bold leading-tight text-ink">Set up two-step sign-in</h1>
            <p className="mt-1 text-[15px] text-body">
              {required
                ? "Firm accounts see client financials, so Admin and Staff sign in with a password and a code from an authenticator app. Your workspace opens once this is done."
                : "Optional for clients: a code from your phone on top of your password."}
            </p>
          </div>
        </div>

        <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s.id} aria-current={i === at ? "step" : undefined} className="space-y-1.5">
              <span className={cn("block h-1 rounded-full", i <= at ? "bg-act" : "bg-hairline")} />
              <span className={cn("block text-[12.5px]", i === at ? "font-medium text-ink" : "text-muted")}>{s.label}</span>
            </li>
          ))}
        </ol>

        {step === "start" ? (
          <form onSubmit={start} className="flex flex-col gap-4" noValidate>
            <Callout icon={<Smartphone />} title="You need an authenticator app">
              Google Authenticator, Microsoft Authenticator, 1Password or any app that shows 6-digit codes.
            </Callout>
            {needsPassword ? (
              <Field label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
            ) : error ? (
              <p role="alert" className="text-sm font-medium text-bad">{error}</p>
            ) : null}
            <SubmitButton busy={busy} busyLabel="Starting…">
              Continue
            </SubmitButton>
          </form>
        ) : null}

        {step === "scan" ? (
          <form onSubmit={verify} className="flex flex-col gap-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-start">
              <div className="mx-auto grid size-[220px] place-items-center rounded-card border border-hairline bg-white p-2">
                {/* QR codes need dark-on-light to scan, in either theme. */}
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR code to add Litch Consulting to your authenticator app" width={204} height={204} />
                ) : (
                  <span className="text-sm text-muted">Preparing…</span>
                )}
              </div>
              <div className="space-y-3 text-sm text-body">
                <p>
                  <b className="text-ink">1.</b> In your app, add an account and scan this code.
                </p>
                <p>
                  <b className="text-ink">2.</b> Can&apos;t scan? Enter this key instead:
                </p>
                {secret ? (
                  <code className="block break-all rounded-ctl bg-surface px-3 py-2 font-mono text-[13px] text-ink">{secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                ) : null}
                <p>
                  <b className="text-ink">3.</b> Type the 6-digit code it shows.
                </p>
              </div>
            </div>
            <Field
              ref={codeRef}
              label="Code from your app"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center font-display text-2xl tracking-[0.5em]"
              error={error}
            />
            <SubmitButton busy={busy} busyLabel="Checking…">
              Verify and turn on
            </SubmitButton>
          </form>
        ) : null}

        {step === "codes" ? (
          <div className="flex flex-col gap-5">
            <Callout tone="good" icon={<KeyRound />} title="Two-step sign-in is on">
              Save these backup codes now. Each one works once, if you lose your phone. <b className="text-ink">We will not show them again.</b>
            </Callout>
            <ul className="grid grid-cols-2 gap-2 rounded-card border border-hairline bg-surface p-4 font-mono text-[14px] text-ink" aria-label="Backup codes">
              {codes.map((c) => (
                <li key={c} className="tabular-nums">
                  {c}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyCodes} className="inline-flex h-10 items-center gap-1.5 rounded-ctl border border-line-strong bg-paper px-3.5 text-sm font-medium text-ink hover:bg-surface">
                <Copy className="size-4" aria-hidden /> Copy
              </button>
              <button type="button" onClick={downloadCodes} className="inline-flex h-10 items-center gap-1.5 rounded-ctl border border-line-strong bg-paper px-3.5 text-sm font-medium text-ink hover:bg-surface">
                <Download className="size-4" aria-hidden /> Download
              </button>
            </div>
            <Check checked={saved} onChange={setSaved}>
              I have saved my backup codes somewhere safe
            </Check>
            <button
              type="button"
              disabled={!saved}
              onClick={() => (window.location.href = done)}
              className="keep-brand inline-flex h-11 items-center justify-center rounded-ctl bg-act px-4 text-[15px] font-semibold text-act-ink hover:bg-act-hover disabled:opacity-50"
            >
              {required ? "Continue to my work" : "Done"}
            </button>
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-center text-[13px] text-muted">Changed phones or lost your codes later? An Admin can reset two-step for you from Team and access.</p>
    </div>
  );
}

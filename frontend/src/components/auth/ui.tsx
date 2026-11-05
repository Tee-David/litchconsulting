"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Auth form parts (R1.1). Labels sit ABOVE the inputs (no floating labels:
 * they hide the label while you type), controls are 44px tall, errors are
 * written under the field they belong to and announced.
 */

export const inputClass =
  "h-11 w-full rounded-ctl border border-line-strong bg-paper px-3.5 text-base text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60 sm:text-[15px] aria-[invalid=true]:border-bad aria-[invalid=true]:ring-bad/15";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Right side of the label row, e.g. "Forgot password?". */
  aside?: ReactNode;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, aside, id, type = "text", className, ...props }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const describedBy = [hint ? `${fid}-hint` : null, error ? `${fid}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fid} className="text-sm font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input
          ref={ref}
          id={fid}
          type={isPassword && show ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(inputClass, isPassword && "pr-11", props.readOnly && "bg-surface text-body", className)}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-ctl text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={`${fid}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fid}-err`} role="alert" className="text-[13px] font-medium text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export function OrDivider({ label = "or with email" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-muted" role="separator">
      <span className="h-px flex-1 bg-hairline" />
      {label}
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}

export function GoogleButton({ onClick, label, disabled, busy }: { onClick: () => void; label: string; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-ctl border border-line-strong bg-paper px-4 text-[15px] font-medium text-ink outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
        </svg>
      )}
      {label}
    </button>
  );
}

export function SubmitButton({ busy, children, busyLabel, disabled, className }: { busy?: boolean; children: ReactNode; busyLabel?: string; disabled?: boolean; className?: string }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      className={cn(
        "keep-brand inline-flex h-11 w-full items-center justify-center gap-2 rounded-ctl bg-act px-4 text-[15px] font-semibold text-act-ink outline-none transition-colors hover:bg-act-hover focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 disabled:opacity-60",
        className,
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

const CALLOUT = {
  info: { cls: "border-info/25 bg-info-soft text-ink", icon: Info, iconCls: "text-info" },
  good: { cls: "border-good/25 bg-good-soft text-ink", icon: CheckCircle2, iconCls: "text-good" },
  warn: { cls: "border-warn/30 bg-warn-soft text-ink", icon: AlertTriangle, iconCls: "text-warn" },
  bad: { cls: "border-bad/30 bg-bad-soft text-ink", icon: ShieldAlert, iconCls: "text-bad" },
} as const;

export function Callout({ tone = "info", title, children, icon, role }: { tone?: keyof typeof CALLOUT; title?: ReactNode; children?: ReactNode; icon?: ReactNode; role?: "alert" | "status" }) {
  const t = CALLOUT[tone];
  const Icon = t.icon;
  return (
    <div role={role} className={cn("flex gap-3 rounded-card border px-4 py-3 text-sm", t.cls)}>
      <span className={cn("mt-0.5 shrink-0 [&_svg]:size-[18px]", t.iconCls)}>{icon ?? <Icon aria-hidden />}</span>
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className="text-body">{children}</div> : null}
      </div>
    </div>
  );
}

/** Heading block every auth step opens with. */
export function AuthHeading({ title, lede, icon, tone }: { title: string; lede?: ReactNode; icon?: ReactNode; tone?: "good" | "warn" | "info" }) {
  return (
    <div className="space-y-2">
      {icon ? (
        <div
          className={cn(
            "mb-3 grid size-12 place-items-center rounded-card [&_svg]:size-6",
            tone === "good" ? "bg-good-soft text-good" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-brand-tint text-accent",
          )}
        >
          {icon}
        </div>
      ) : null}
      <h1 className="font-display text-[1.65rem] font-bold leading-tight tracking-tight text-ink">{title}</h1>
      {lede ? <p className="text-[15px] leading-relaxed text-body">{lede}</p> : null}
    </div>
  );
}

export function Check({ checked, onChange, children, id }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <label htmlFor={fid} className="flex cursor-pointer items-start gap-2.5 text-sm text-body">
      <input id={fid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 rounded accent-[var(--color-act)]" />
      <span>{children}</span>
    </label>
  );
}

/** Mask an email for display: e••••@okonkwoagro.ng */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 1)}${"•".repeat(Math.max(3, Math.min(6, local.length - 1)))}@${domain}`;
}

/** Turn Better Auth error codes into words a person can act on. */
export function authErrorText(err: { code?: string; message?: string; status?: number } | null | undefined, fallback: string): string {
  if (!err) return fallback;
  if (err.status === 429) return "Too many tries from this connection. Wait about 10 minutes and try again.";
  switch (err.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password do not match. Check both, or reset your password.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "There is already an account for this email. Sign in instead, or reset your password.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 8 characters.";
    case "PASSWORD_BREACHED":
      return "That password has appeared in a known data breach. Choose a different one.";
    case "ACCOUNT_SUSPENDED":
      return "This account is suspended. Contact Litch Consulting if you think this is a mistake.";
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_CODE":
      return "That code is not right. Codes change every 30 seconds; use the one showing now.";
    case "INVALID_BACKUP_CODE":
      return "That backup code is not right, or it was already used.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
    case "TOO_MANY_CODES":
      return "Too many codes tried. Sign in again in a few minutes.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "This sign-in took too long. Enter your email and password again.";
    case "INVALID_TOKEN":
      return "This link is no longer valid. Ask for a new one.";
  }
  return err.message && err.message.length < 160 ? err.message : fallback;
}

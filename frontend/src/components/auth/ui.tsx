"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/* Floating-label input matching the Litch design system (brand-blue focus). */
export function FloatingInput({
  label,
  id,
  type = "text",
  className,
  placeholder = " ",
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;
  return (
    <div className="relative">
      <input
        id={id}
        type={inputType}
        placeholder={placeholder}
        className={cn(
          // placeholder is hidden while the label sits centred, and fades in on
          // focus (once the label has floated up) so the two never overlap.
          "peer w-full rounded-xl border border-hairline bg-white px-3.5 pb-2 pt-5 text-sm text-ink outline-none transition-colors placeholder:text-transparent focus:border-brand focus:ring-2 focus:ring-brand/15 focus:placeholder:text-muted dark:border-white/15 dark:bg-white/[0.06] dark:text-white",
          isPassword && "pr-11",
          className,
        )}
        {...props}
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3.5 top-2 text-[11px] font-medium text-muted transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-brand"
      >
        {label}
      </label>
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-ink"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-hairline" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">or</span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}

export function GoogleButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-hairline bg-white px-4 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-60 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
      </svg>
      {label}
    </button>
  );
}

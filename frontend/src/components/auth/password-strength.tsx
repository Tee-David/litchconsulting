"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Password strength meter + live requirement list. Status colours come from
 * the semantic tokens (bad / warn / info / good), so it reads in dark mode.
 * The real gate is on the server (length + known-breach check).
 */
type Rule = { label: string; test: (pw: string) => boolean };

const LABELS = ["Weak", "Fair", "Good", "Strong"] as const;
const BAR = ["bg-bad", "bg-warn", "bg-info", "bg-good"] as const;
const TEXT = ["text-bad", "text-warn", "text-info", "text-good"] as const;

function score(pw: string, forbidden: string[]) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (pw.length >= 14) s++;
  if (/\s/.test(pw)) s = Math.min(s, 1);
  if (forbidden.some((f) => f && f.length > 2 && pw.toLowerCase().includes(f.toLowerCase()))) s = Math.min(s, 1);
  return Math.min(s, 4);
}

export function PasswordStrength({ password, forbidden = [], min = 10 }: { password: string; forbidden?: string[]; min?: number }) {
  if (!password) return null;
  const s = score(password, forbidden);
  const idx = Math.max(0, Math.min(3, s - 1));
  const includesForbidden = forbidden.some((f) => f && f.length > 2 && password.toLowerCase().includes(f.toLowerCase()));
  const rules: Rule[] = [
    { label: `At least ${min} characters`, test: (pw) => pw.length >= min },
    { label: "A number or a symbol", test: (pw) => /[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw) },
    { label: "Does not include your name or email", test: () => !includesForbidden },
  ];
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= idx ? BAR[idx] : "bg-hairline")} />
          ))}
        </div>
        <span className={cn("text-xs font-semibold", TEXT[idx])}>{LABELS[idx]}</span>
      </div>
      <ul className="space-y-1">
        {rules.map((r) => {
          const ok = r.test(password);
          return (
            <li key={r.label} className={cn("flex items-center gap-2 text-[12.5px]", ok ? "text-body" : "text-bad")}>
              {ok ? <Check className="size-3.5 shrink-0 text-good" aria-hidden /> : <X className="size-3.5 shrink-0" aria-hidden />}
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Same rule the server applies to new passwords chosen in the app. */
export function passwordIssue(pw: string, min = 10): string | null {
  if (pw.length < min) return `Use at least ${min} characters.`;
  if (!/[0-9]/.test(pw) && !/[^A-Za-z0-9]/.test(pw)) return "Add a number or a symbol.";
  return null;
}

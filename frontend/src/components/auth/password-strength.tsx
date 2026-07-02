"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

/**
 * Password strength meter + live requirement checklist (adapted from the
 * nomarc pattern, re-themed to Litch tokens). Status colours stay semantic
 * (red / amber / green); neutrals use our light/dark tokens.
 */
type Rule = { label: string; test: (pw: string) => boolean };

const BASE_RULES: Rule[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "One symbol or number", test: (pw) => /[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw) },
  { label: "No spaces", test: (pw) => pw.length > 0 && !/\s/.test(pw) },
];

const LABELS = ["Weak", "Fair", "Good", "Strong"] as const;
const COLORS = ["#e5484d", "#f5a524", "#4c6ef5", "#16a34a"] as const;

function score(pw: string, forbidden: string[]) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (pw.length >= 12) s++;
  if (/\s/.test(pw)) s = Math.min(s, 1);
  if (forbidden.some((f) => f && pw.toLowerCase().includes(f.toLowerCase()))) s = Math.min(s, 1);
  return Math.min(s, 4);
}

export function PasswordStrength({ password, forbidden = [] }: { password: string; forbidden?: string[] }) {
  if (!password) return null;

  const s = score(password, forbidden);
  const idx = Math.max(0, Math.min(3, s - 1));
  const color = COLORS[idx];

  const includesForbidden = forbidden.some((f) => f && password.toLowerCase().includes(f.toLowerCase()));
  const rules: Rule[] = [
    ...BASE_RULES,
    { label: "Doesn't include your name or email", test: () => !includesForbidden },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-2.5 space-y-3"
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline dark:bg-white/10">
              <motion.div
                className="h-full rounded-full"
                initial={false}
                animate={{ width: i <= idx ? "100%" : "0%", backgroundColor: color }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          ))}
        </div>
        <span className="text-xs font-semibold" style={{ color }}>
          {LABELS[idx]}
        </span>
      </div>

      <ul className="space-y-1.5">
        {rules.map((r) => {
          const ok = r.test(password);
          return (
            <li key={r.label} className="flex items-center gap-2 text-[12.5px]">
              {ok ? (
                <Check size={14} strokeWidth={2.5} className="shrink-0 text-[#16a34a]" />
              ) : (
                <X size={14} strokeWidth={2.5} className="shrink-0 text-[#e5484d]" />
              )}
              <span className={ok ? "text-body dark:text-white/60" : "text-[#e5484d]"}>{r.label}</span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

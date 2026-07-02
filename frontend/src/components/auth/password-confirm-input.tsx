"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

/**
 * Confirm-password field with a live per-character match preview (adapted from
 * the nomarc pattern, re-themed to Litch tokens). The preview strip turns green
 * once it matches, red per-character on mismatch, and shakes if you type past a
 * mismatch. Border goes brand-green on full match.
 */
export function PasswordConfirmInput({
  passwordToMatch,
  value,
  onChange,
}: {
  passwordToMatch: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [shake, setShake] = useState(false);
  const [show, setShow] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    if (value.length >= passwordToMatch.length && next.length > value.length) {
      setShake(true);
    } else {
      onChange(next);
    }
  }

  useEffect(() => {
    if (!shake) return;
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [shake]);

  function letterStatus(letter: string, index: number) {
    if (!value[index]) return "";
    return value[index] === letter ? "bg-emerald-500/25" : "bg-red-500/25";
  }

  const matched = passwordToMatch.length > 0 && passwordToMatch === value;
  const shakeAnim = { x: shake ? [-8, 8, -6, 6, 0] : 0, transition: { duration: 0.45 } };
  const borderColor = matched ? "rgb(16 185 129)" : "var(--color-hairline)";

  return (
    <div className="space-y-1.5">
      {/* per-character match preview */}
      {passwordToMatch.length > 0 && (
        <motion.div
          className="relative h-[42px] w-full overflow-hidden rounded-xl border-2 bg-white px-2 dark:bg-white/[0.06]"
          animate={{ ...shakeAnim, borderColor }}
          style={{ borderColor }}
        >
          <div className="absolute inset-0 flex items-center gap-0 px-2">
            {passwordToMatch.split("").map((_, i) => (
              <div key={i} className="flex w-4 shrink-0 items-center justify-center">
                <span className="block size-[5px] rounded-full bg-ink opacity-50 dark:bg-white" />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 flex items-center px-2">
            {passwordToMatch.split("").map((letter, i) => (
              <div
                key={i}
                className={`h-full w-4 shrink-0 transition-colors duration-200 ${letterStatus(letter, i)}`}
                style={{
                  transform: value[i] ? "scaleX(1)" : "scaleX(0)",
                  transformOrigin: "left",
                  transition: "transform 0.15s ease, background-color 0.2s ease",
                }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* confirm input */}
      <motion.div animate={shakeAnim} className="relative">
        <motion.input
          type={show ? "text" : "password"}
          placeholder="Confirm password"
          value={value}
          onChange={handleChange}
          autoComplete="new-password"
          className="w-full rounded-xl border-2 bg-white px-3.5 py-2.5 pr-10 text-sm tracking-[0.25em] text-ink placeholder:tracking-normal placeholder:text-muted focus:outline-none dark:bg-white/[0.06] dark:text-white"
          animate={{ borderColor }}
          style={{ borderColor }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-ink dark:hover:text-white"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </motion.div>
    </div>
  );
}

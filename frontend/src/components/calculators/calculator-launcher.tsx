"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Calculator, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CalculatorHub } from "./calculator-hub";
import { CalculatorShell } from "./calculator-shell";

/**
 * Self-contained calculator widget: a top-bar trigger + a slide-over panel with
 * the calculator hub (cards) → individual calculators. Rendered via a portal so
 * the header's backdrop-blur doesn't trap the fixed overlay.
 */
export function CalculatorButton({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open calculators"
        onClick={() => setOpen(true)}
        className={cn(
          "grid size-10 place-items-center rounded-full transition-colors",
          tone === "light"
            ? "border border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20"
            : "text-body hover:bg-surface hover:text-ink",
          className,
        )}
      >
        <Calculator className="size-5" />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-[100]">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setOpen(false)}
                  className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
                />
                <motion.aside
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "tween", duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-paper shadow-2xl"
                >
                  <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-9 place-items-center rounded-xl bg-brand text-white keep-brand">
                        <Calculator className="size-5" />
                      </span>
                      <div>
                        <h2 className="font-display text-base font-bold text-ink">Financial calculators</h2>
                        <p className="text-xs text-muted">Nigeria — 2026 tax year</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={() => setOpen(false)}
                      className="grid size-9 place-items-center rounded-lg text-body transition-colors hover:bg-surface hover:text-ink"
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    {active ? (
                      <CalculatorShell calcKey={active} onBack={() => setActive(null)} />
                    ) : (
                      <CalculatorHub onSelect={setActive} />
                    )}
                  </div>
                </motion.aside>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

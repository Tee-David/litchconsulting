"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastCtx = {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within <Toaster>");
  return ctx;
}

const ICON = { success: CheckCircle2, error: AlertCircle, info: Info } as const;
const ACCENT = {
  success: "text-emerald-500",
  error: "text-red-500",
  info: "text-brand dark:text-highlight",
} as const;

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  const api = useMemo<ToastCtx>(
    () => ({
      toast,
      success: (m: string) => toast(m, "success"),
      error: (m: string) => toast(m, "error"),
    }),
    [toast],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2.5 sm:bottom-6 sm:right-6">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICON[t.kind];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.96 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-auto flex items-start gap-3 rounded-xl border border-hairline bg-paper p-3.5 shadow-lg shadow-black/10"
              >
                <Icon className={cn("mt-0.5 size-5 shrink-0", ACCENT[t.kind])} />
                <p className="flex-1 text-sm text-ink">{t.message}</p>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="text-muted transition-colors hover:text-ink"
                  aria-label="Dismiss"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * App-wide confirmation dialogs. `useConfirm()` returns a promise<boolean>.
 * For high-impact actions pass `typeToConfirm` — the confirm button stays
 * disabled until the user types the exact phrase (e.g. the client's name).
 * Replaces scattered window.confirm() calls with a tokened, a11y dialog.
 */
export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  /** When set, the confirm button unlocks only when the input matches this exactly. */
  typeToConfirm?: string;
};

type Pending = ConfirmOptions & { resolve: (v: boolean) => void };

const Ctx = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setTyped("");
    return new Promise<boolean>((resolve) => setPending({ ...opts, resolve }));
  }, []);

  function close(result: boolean) {
    pending?.resolve(result);
    setPending(null);
    setTyped("");
  }

  const locked = Boolean(pending?.typeToConfirm) && typed.trim() !== pending?.typeToConfirm?.trim();
  const danger = pending?.tone !== "brand";

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {pending && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-4"
          >
            <motion.div
              className="absolute inset-0 bg-night/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => close(false)}
            />
            <motion.div
              className="relative w-full max-w-md rounded-t-hero bg-paper p-6 shadow-2xl shadow-black/20 sm:rounded-card"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-start gap-3.5">
                {danger && (
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-500">
                    <AlertTriangle className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-base font-bold text-ink">{pending.title}</h2>
                  {pending.description && (
                    <div className="mt-1.5 text-sm leading-relaxed text-body">
                      {pending.description}
                    </div>
                  )}
                </div>
              </div>

              {pending.typeToConfirm && (
                <div className="mt-4">
                  <label className="text-xs font-medium text-body">
                    Type <span className="font-semibold text-ink">{pending.typeToConfirm}</span> to
                    confirm
                  </label>
                  <input
                    ref={inputRef}
                    value={typed}
                    autoFocus
                    onChange={(e) => setTyped(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-body transition-colors hover:bg-surface"
                >
                  {pending.cancelLabel ?? "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => close(true)}
                  disabled={locked}
                  className={cn(
                    "rounded-full px-5 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40",
                    danger ? "bg-red-600 hover:bg-red-700" : "bg-brand hover:bg-brand-hover keep-brand"
                  )}
                >
                  {pending.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

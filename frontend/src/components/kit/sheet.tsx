"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sheet — the one overlay. Right-side panel on ≥ sm, bottom sheet with a grab
 * bar on phones. Sticky header and footer, scrolling body, focus trapped,
 * Escape and scrim close it, focus returns to the opener.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** false while a save is in flight, so it can't be closed mid-write. */
  dismissible?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the first focusable control (or the panel itself).
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>(
        "input, select, textarea, button:not([data-sheet-close]), [href], [tabindex]:not([tabindex='-1'])",
      );
      (first ?? panel.current)?.focus();
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const f = Array.from(
        panel.current.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (!f.length) return;
      const [a, z] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener.current?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!mounted || !open) return null;

  const width = size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl";

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-scrim" aria-hidden onClick={() => dismissible && onClose()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col bg-paper text-ink shadow-2xl outline-none",
          // phone: bottom sheet
          "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.25rem]",
          // ≥ sm: right panel
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:rounded-none sm:rounded-l-[1.25rem]",
          width,
          "animate-[sheet-in_220ms_var(--ease-out-soft)]",
        )}
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-line-strong" />
        </div>
        <header className="flex items-start gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-sm text-body">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            data-sheet-close
            aria-label="Close"
            disabled={!dismissible}
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-ctl text-muted hover:bg-surface hover:text-ink disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirm before a consequential action. With `typeToConfirm`, the user must
 * type the phrase (e.g. the invoice number) before the button enables — used
 * for permanent deletes, erasure and purges.
 */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  tone = "default",
  typeToConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<unknown> | unknown;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "default" | "danger";
  typeToConfirm?: string;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTyped("");
      setErr(null);
    }
  }, [open]);
  const ready = !typeToConfirm || typed.trim() === typeToConfirm;

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={go} disabled={!ready || busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-body">
        <div>{body}</div>
        {typeToConfirm ? (
          <label className="block">
            <span className="mb-1.5 block font-medium text-ink">
              Type <span className="font-mono">{typeToConfirm}</span> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="h-10 w-full rounded-ctl border border-line-strong bg-paper px-3 font-mono text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        ) : null}
        {err ? <p className="text-bad">{err}</p> : null}
      </div>
    </Sheet>
  );
}

/** Kit button (dashboards). One primary per view. */
export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-10 px-3.5 text-sm",
        variant === "primary" && "bg-act font-semibold text-act-ink hover:bg-act-hover",
        variant === "secondary" && "border border-line-strong bg-paper text-ink hover:bg-surface",
        variant === "ghost" && "text-body hover:bg-surface hover:text-ink",
        variant === "danger" && "bg-bad font-semibold text-white hover:opacity-90",
        className,
      )}
    />
  );
}

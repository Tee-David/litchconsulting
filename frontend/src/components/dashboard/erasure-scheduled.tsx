"use client";

import { CalendarClock, LogOut } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { signOut } from "@/lib/auth-client";

/**
 * Shown instead of the client portal while the client's erasure is scheduled
 * (NDPA, 30-day hold). Nothing is removed until the date; the firm can cancel.
 */
export function ErasureScheduled({ dueAt }: { dueAt: string }) {
  const date = new Date(dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <main className="grid min-h-dvh place-items-center bg-cloud px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-hairline bg-paper p-6 shadow-sm sm:p-8">
        <Logo className="h-8" />
        <span className="mt-6 grid size-11 place-items-center rounded-ctl bg-bad-soft text-bad" aria-hidden>
          <CalendarClock className="size-5" />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold text-ink">Your account is scheduled for erasure</h1>
        <p className="mt-2 text-body">
          Your data will be erased on <strong className="text-ink">{date}</strong>. Until then your portal is closed and nothing has been removed.
        </p>
        <p className="mt-3 text-body">
          Invoices, receipts and payments are kept for 6 years, as Nigerian tax law requires, with your name and contact details removed.
        </p>
        <p className="mt-3 text-body">
          Changed your mind, or need a copy of your data first? Email{" "}
          <a href="mailto:info@litchconsulting.com" className="font-medium text-accent hover:underline">
            info@litchconsulting.com
          </a>{" "}
          before that date.
        </p>
        <button
          type="button"
          onClick={() => void signOut().then(() => (window.location.href = "/"))}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-ctl border border-line-strong px-4 text-sm font-medium text-ink hover:bg-surface"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </main>
  );
}

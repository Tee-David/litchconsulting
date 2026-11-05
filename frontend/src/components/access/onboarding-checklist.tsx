"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, X } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { Button } from "@/components/kit";
import { hideOnboardingAction } from "@/app/account/actions";
import type { OnboardingState } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * The getting-started checklist (R1.5). Rendered by <Onboarding /> (the RSC
 * wrapper) on each role's home until it is done or hidden, and full-size on
 * /account/welcome for admins. Anchor: data-tour="onboarding".
 */
export function OnboardingChecklist({ state, homeHref, standalone }: { state: OnboardingState; homeHref?: string; standalone?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pct = Math.round((state.done / Math.max(1, state.total)) * 100);
  const title = state.role === "admin" ? "Set up Litch" : state.role === "staff" ? "Get started" : "Finish setting up";

  function hide(mode: "tomorrow" | "done") {
    start(async () => {
      const r = await hideOnboardingAction(mode);
      if (r.ok) {
        toast.success(r.message ?? "Hidden.");
        if (!standalone) router.refresh();
        else if (homeHref) router.push(homeHref);
      } else toast.error(r.error);
    });
  }

  return (
    <section data-tour="onboarding" aria-labelledby="onboarding-title" className="min-w-0 rounded-card border border-hairline bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id="onboarding-title" className="font-display text-[15px] font-semibold text-ink">
            {standalone ? "Checklist" : title}
          </h2>
          <p className="text-[13px] text-muted">
            {state.done} of {state.total} done
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => hide("tomorrow")} disabled={pending}>
            Hide until tomorrow
          </Button>
          <button
            type="button"
            onClick={() => hide("done")}
            disabled={pending}
            aria-label="Close the checklist for good"
            className="grid size-8 place-items-center rounded-ctl text-muted outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </header>
      <div className="px-4 pb-2 pt-3 sm:px-5">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
          <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="divide-y divide-hairline px-4 sm:px-5">
        {state.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-3">
            {i.done ? <CheckCircle2 className="size-5 shrink-0 text-good" aria-label="Done" /> : <Circle className="size-5 shrink-0 text-faint" aria-label="Not done" />}
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", i.done ? "text-body" : "text-ink")}>
                {i.title}
                {i.optional ? <span className="ml-1.5 text-[12px] font-normal text-muted">Optional</span> : null}
              </p>
              <p className="truncate text-[13px] text-muted">{i.detail}</p>
            </div>
            {i.done ? (
              <span className="hidden text-[12.5px] font-medium text-good sm:inline">Done</span>
            ) : (
              <Link
                href={i.href}
                className="inline-flex h-8 shrink-0 items-center rounded-ctl border border-line-strong bg-paper px-2.5 text-[13px] font-medium text-ink hover:bg-surface"
              >
                {i.action}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

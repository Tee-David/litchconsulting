"use client";

import type { ReactNode } from "react";
import { TourProvider } from "@/components/tour/tour-provider";
import { TourLauncher } from "@/components/tour/tour-launcher";
import { InstallPrompt } from "@/components/admin/install-prompt";
import { AppShell, type ShellCounts } from "./app-shell";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SageIcon } from "@/components/admin/sage-icon";
import { SageWidget } from "@/components/sage/sage-widget";

/** Staff top bar: Ask Sage, as in the admin top bar (hidden on the Sage page itself). */
function AskSageLink() {
  const pathname = usePathname();
  if (pathname?.startsWith("/work/sage")) return null;
  return (
    <Link
      href="/work/sage"
      data-tour="sage"
      aria-label="Ask Sage"
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-ctl border border-line-strong bg-paper px-2.5 text-[13.5px] font-semibold text-ink hover:bg-surface max-sm:w-10 max-sm:justify-center"
    >
      <SageIcon className="size-[18px] text-accent" />
      <span className="hidden sm:inline">Ask Sage</span>
    </Link>
  );
}

/** Client portal frame: shell + guided tours + PWA install prompt. */
export function ClientFrame({
  user,
  counts,
  children,
}: {
  user: { name: string; email: string; sub: string };
  counts: ShellCounts;
  children: ReactNode;
}) {
  return (
    <TourProvider audience="client">
      <AppShell
        kind="client"
        user={user}
        counts={counts}
        launcher={<TourLauncher />}
      >
        {children}
      </AppShell>
      <InstallPrompt />
    </TourProvider>
  );
}

/** Staff workspace frame: shell + the staff tours (R1.5). */
export function StaffFrame({
  user,
  counts,
  preview,
  children,
}: {
  user: { name: string; email: string; sub: string };
  counts: ShellCounts;
  preview: boolean;
  children: ReactNode;
}) {
  return (
    <TourProvider audience="staff">
      <AppShell
        kind="staff"
        user={user}
        counts={counts}
        launcher={
          <>
            <TourLauncher />
            <AskSageLink />
          </>
        }
        banner={
          preview ? (
            <div
              role="status"
              className="border-b border-hairline bg-info-soft px-4 py-2 text-center text-sm text-info sm:px-6"
            >
              You are previewing the staff workspace. It shows only requests
              assigned to you, with no amounts.
            </div>
          ) : null
        }
      >
        {children}
      </AppShell>
      <SageWidget role="staff" basePath="/work/sage" />
    </TourProvider>
  );
}

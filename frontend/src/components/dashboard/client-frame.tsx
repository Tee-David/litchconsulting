"use client";

import type { ReactNode } from "react";
import { TourProvider } from "@/components/tour/tour-provider";
import { TourLauncher } from "@/components/tour/tour-launcher";
import { InstallPrompt } from "@/components/admin/install-prompt";
import { AppShell, type ShellCounts } from "./app-shell";

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
        launcher={
          <div className="hidden sm:block" data-tour="tour-launcher">
            <TourLauncher />
          </div>
        }
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
          <div className="hidden sm:block" data-tour="tour-launcher">
            <TourLauncher />
          </div>
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
    </TourProvider>
  );
}

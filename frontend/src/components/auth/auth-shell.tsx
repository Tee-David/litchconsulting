import type { ReactNode } from "react";
import { BrandPanel } from "./brand-panel";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { InstallPrompt } from "@/components/admin/install-prompt";

/** Full-bleed split-screen auth: brand panel (left) + form area (right). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[42%_1fr]">
      <BrandPanel />
      <div className="relative flex min-h-screen items-center justify-center bg-paper px-6 py-10 sm:px-10">
        {/* Mobile theme toggle (desktop toggle lives in the brand panel) */}
        <div className="absolute right-5 top-5 lg:hidden">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <InstallPrompt />
    </div>
  );
}

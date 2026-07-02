import type { ReactNode } from "react";
import { BrandPanel } from "./brand-panel";

/** Full-bleed split-screen auth: brand panel (left) + form area (right). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[42%_1fr]">
      <BrandPanel />
      <div className="flex min-h-screen items-center justify-center bg-paper px-6 py-10 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

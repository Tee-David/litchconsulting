import type { ReactNode } from "react";
import { BrandPanel } from "./brand-panel";

/** Split-screen auth container: brand panel (left) + form area (right). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-cloud p-3 sm:p-5 lg:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-3xl border border-hairline bg-white shadow-xl">
        <BrandPanel />
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Route-based sub-navigation tabs (e.g. the Finance workspace). */
export function Tabs({ tabs }: { tabs: { label: string; href: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-hairline">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors",
              active ? "text-brand" : "text-body hover:text-ink",
            )}
          >
            {t.label}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand dark:bg-white" />
            )}
          </Link>
        );
      })}
    </div>
  );
}

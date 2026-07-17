"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Route-based sub-navigation tabs (e.g. the Finance workspace). */
export function Tabs({ tabs }: { tabs: { label: string; href: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto overscroll-x-contain touch-pan-x border-b border-hairline">
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

/**
 * Query-param tabs (`?tab=…`) for RSC pages that switch sections without
 * subroutes (e.g. the client profile hub). Deep-linkable, prefetchable, and
 * the server only fetches the active tab's data.
 */
export function QueryTabs({
  tabs,
  param = "tab",
  defaultValue,
}: {
  tabs: { label: string; value: string; count?: number }[];
  param?: string;
  defaultValue: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) || defaultValue;
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto overscroll-x-contain touch-pan-x border-b border-hairline">
      {tabs.map((t) => {
        const active = current === t.value;
        const href =
          t.value === defaultValue ? pathname : `${pathname}?${param}=${encodeURIComponent(t.value)}`;
        return (
          <Link
            key={t.value}
            href={href}
            className={cn(
              "relative flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors",
              active ? "text-brand" : "text-body hover:text-ink"
            )}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                  active ? "bg-brand-tint text-brand" : "bg-surface text-muted"
                )}
              >
                {t.count}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand dark:bg-white" />
            )}
          </Link>
        );
      })}
    </div>
  );
}

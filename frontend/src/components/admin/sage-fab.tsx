"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SageIcon } from "./sage-icon";

/**
 * Floating "Ask Sage" action button — bottom-right on every admin page, so the
 * assistant is one tap away without leaving the current view. Hidden on the Sage
 * page itself. Brand navy with a white mark reads well on both light and dark
 * surfaces; the hover label is suppressed on small screens.
 */
export function SageFab() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin/sage")) return null;

  return (
    <Link
      href="/admin/sage"
      aria-label="Ask Sage"
      data-tour="sage-fab"
      className="group keep-brand fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex size-12 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/35 ring-1 ring-white/10 transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none sm:bottom-6 sm:right-6 sm:size-14"
    >
      <SageIcon className="size-6 sm:size-7" />
      <span className="pointer-events-none absolute right-full mr-3 hidden translate-x-1 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-paper opacity-0 shadow-md transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 md:block">
        Ask Sage
      </span>
    </Link>
  );
}

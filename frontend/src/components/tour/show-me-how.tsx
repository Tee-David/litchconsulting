"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { useTourOptional } from "./tour-provider";

/**
 * "Show me how" under an empty state: starts the page tour. It renders nothing
 * outside a tour provider (the public site) or on a page with no tour.
 */
export function ShowMeHow() {
  const tour = useTourOptional();
  const [can, setCan] = useState(false);
  const probe = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // The page's parts mount first; then check that its tour has something to show.
    // Not inside a sheet or dialog: a page tour there would start behind it.
    const t = setTimeout(() => setCan(Boolean(tour?.hasPageTour()) && !probe.current?.closest('[role="dialog"]')), 400);
    return () => clearTimeout(t);
  }, [tour]);
  if (!tour) return null;
  if (!can) return <span ref={probe} hidden />;
  return (
    <button
      type="button"
      onClick={() => tour.startPageTour()}
      className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-accent hover:bg-surface dark:text-info"
    >
      <CircleHelp className="size-4" aria-hidden /> Show me how
    </button>
  );
}

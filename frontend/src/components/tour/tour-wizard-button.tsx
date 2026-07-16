"use client";

import { Sparkles } from "lucide-react";
import { useTour } from "./tour-provider";

/**
 * Prominent branded pill that kicks off the full guided walkthrough. Placed on
 * the client dashboard so first-time users have an obvious way in.
 */
export function TourWizardButton() {
  const { startWalkthrough } = useTour();

  return (
    <button
      type="button"
      onClick={startWalkthrough}
      className="inline-flex items-center gap-2 self-start rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover keep-brand"
    >
      <Sparkles className="size-4" />
      Take a guided tour
    </button>
  );
}

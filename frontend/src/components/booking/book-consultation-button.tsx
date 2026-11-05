"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { getCalApi } from "@calcom/embed-react";
import { useConsent } from "@/lib/consent";

/**
 * Opens the Cal.com booking flow in a popup **modal** (no page navigation),
 * driven by `NEXT_PUBLIC_CALCOM_LINK`. When that env is unset we fall back to a
 * plain deep-link to `/book`, so booking never breaks in any environment.
 *
 * Styling is caller-owned: pass `className`/`children` so the same trigger can
 * be a marketing button or a dashboard quick-action tile.
 */

// NEXT_PUBLIC_* vars are inlined at build time and safe to read on the client.
const CAL_LINK = process.env.NEXT_PUBLIC_CALCOM_LINK;
const CAL_NAMESPACE = "consultation";

export function BookConsultationButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  // Cal.com loads its own scripts and cookies: only after the visitor allows
  // third-party embeds (cookie settings). Until then the button goes to /book.
  const consent = useConsent();
  const allowed = Boolean(consent?.embeds);
  useEffect(() => {
    if (!CAL_LINK || !allowed) return;
    void (async () => {
      const cal = await getCalApi({ namespace: CAL_NAMESPACE });
      cal("ui", {
        hideEventTypeDetails: false,
        layout: "month_view",
        cssVarsPerTheme: {
          light: { "cal-brand": "#0a196d" },
          dark: { "cal-brand": "#8ea2ff" },
        },
      });
    })();
  }, [allowed]);

  // Fallback: no Cal link configured → deep-link to the /book page.
  if (!CAL_LINK || !allowed) {
    return (
      <Link href="/book" className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      data-cal-namespace={CAL_NAMESPACE}
      data-cal-link={CAL_LINK}
      data-cal-config='{"layout":"month_view"}'
    >
      {children}
    </button>
  );
}

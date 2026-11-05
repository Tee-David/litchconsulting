"use client";

import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { CalendarClock } from "lucide-react";
import { openConsentSettings, saveConsent, useConsent } from "@/lib/consent";

/**
 * Cal.com inline scheduler — real availability from the firm's calendar,
 * timezone handling, reminders, and reschedule/cancel links all included.
 * Bookings are mirrored into our DB via /api/calcom/webhook.
 * Rendered only when NEXT_PUBLIC_CALCOM_LINK is set (see /book page).
 */
export function CalBooking({ calLink, fallback }: { calLink: string; fallback?: React.ReactNode }) {
  const consent = useConsent();
  const allowed = Boolean(consent?.embeds);
  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      const cal = await getCalApi();
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

  // Cal.com sets its own cookies: nothing loads until the visitor allows it.
  if (!allowed) {
    return (
      <div className="space-y-6">
        <div className="rounded-card border border-hairline bg-paper p-6 text-center">
          <CalendarClock className="mx-auto size-8 text-accent" aria-hidden />
          <p className="mt-3 font-display text-lg font-semibold text-ink">Pick a time on our calendar</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-body">
            The calendar is provided by Cal.com, which sets its own cookies. Load it, or send the form below and we will reply to arrange a time.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => saveConsent(true)} className="keep-brand inline-flex h-10 items-center rounded-ctl bg-act px-4 text-sm font-semibold text-act-ink hover:bg-act-hover">
              Load the calendar
            </button>
            <button type="button" onClick={() => openConsentSettings()} className="inline-flex h-10 items-center rounded-ctl border border-line-strong bg-paper px-4 text-sm font-medium text-ink hover:bg-surface">
              Cookie settings
            </button>
          </div>
        </div>
        {fallback}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-paper">
      <Cal
        calLink={calLink}
        style={{ width: "100%", height: "100%", minHeight: "620px" }}
        config={{ layout: "month_view" }}
      />
    </div>
  );
}

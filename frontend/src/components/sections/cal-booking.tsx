"use client";

import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";

/**
 * Cal.com inline scheduler — real availability from the firm's calendar,
 * timezone handling, reminders, and reschedule/cancel links all included.
 * Bookings are mirrored into our DB via /api/calcom/webhook.
 * Rendered only when NEXT_PUBLIC_CALCOM_LINK is set (see /book page).
 */
export function CalBooking({ calLink }: { calLink: string }) {
  useEffect(() => {
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
  }, []);

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

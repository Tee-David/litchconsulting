"use client";

import { useEffect, useState } from "react";
import { Joyride, EVENTS, type Step } from "react-joyride";

const DONE_KEY = "litch:portal-tour-done";

const ALL_STEPS: Step[] = [
  {
    target: '[data-tour="request-service"]',
    title: "Request a service",
    content:
      "Everything starts here — pick a service, tell us what you need, and pay securely. We guide you step by step.",
  },
  {
    target: '[data-tour="services"]',
    title: "Your services at a glance",
    content: "Browse what we offer with upfront pricing. One tap opens the guided request flow.",
  },
  {
    target: '[data-tour="active-requests"]',
    title: "Live progress",
    content:
      "Each active request shows its milestones — payment, documents, work in progress, delivery — so you always know what's happening and what's next.",
  },
  {
    target: '[data-tour="billing"]',
    title: "Billing & receipts",
    content: "Invoices, quotes and receipts live here. Paying online updates everything instantly.",
  },
  {
    target: '[data-tour="quick-actions"]',
    title: "Need anything else?",
    content:
      "Book a free consultation or open a support ticket any time — a real person replies quickly.",
  },
];

/**
 * One-time guided tour of the client portal (react-joyride v3), shown on the
 * first dashboard visit. Steps whose targets aren't on the page (e.g. no
 * active requests yet) are filtered out up front.
 */
export function PortalTour() {
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(DONE_KEY)) return;
    } catch {
      return;
    }
    const present = ALL_STEPS.filter(
      (s) => typeof s.target === "string" && document.querySelector(s.target)
    );
    if (present.length) setSteps(present);
  }, []);

  if (!steps) return null;

  return (
    <Joyride
      steps={steps}
      run
      continuous
      scrollToFirstStep
      locale={{ back: "Back", close: "Close", last: "Done", next: "Next", skip: "Skip tour" }}
      options={{
        skipBeacon: true,
        showProgress: true,
        scrollOffset: 96,
        zIndex: 200,
        buttons: ["back", "skip", "primary"],
        primaryColor: "#0a196d",
        textColor: "var(--color-ink, #101828)",
        backgroundColor: "var(--color-paper, #ffffff)",
        arrowColor: "var(--color-paper, #ffffff)",
        overlayColor: "rgba(10, 15, 40, 0.55)",
        spotlightRadius: 14,
      }}
      styles={{
        tooltip: { borderRadius: 16, padding: 18 },
        tooltipTitle: { fontWeight: 700, fontSize: 15 },
        tooltipContent: { fontSize: 13.5, lineHeight: 1.55, padding: "10px 0 0" },
        buttonPrimary: { borderRadius: 9999, padding: "9px 18px", fontWeight: 600, fontSize: 13 },
        buttonBack: { fontSize: 13 },
        buttonSkip: { fontSize: 13 },
      }}
      onEvent={(data) => {
        if (data.type === EVENTS.TOUR_END) {
          try {
            localStorage.setItem(DONE_KEY, "1");
          } catch {}
          setSteps(null);
        }
      }}
    />
  );
}

import type { Step } from "react-joyride";

/**
 * Tour registry — the single source of truth for every guided tour in the app.
 *
 * A `TourStep` is a react-joyride `Step` plus a few Litch-specific fields:
 *  - `key`         stable id for the step (debugging / React keys)
 *  - `route`       walkthrough steps that live on another page set this; the
 *                  provider decorates them with a `before` hook that navigates.
 *  - `optional`    the step is dropped silently if its target isn't in the DOM.
 *  - `desktopOnly` the step is dropped on viewports below the `lg` breakpoint
 *                  (used for sidebar-nav anchors that are hidden on mobile).
 */
export type TourAudience = "client" | "admin";
export type TourKind = "page" | "welcome" | "walkthrough";

export type TourStep = Step & {
  key: string;
  route?: string;
  optional?: boolean;
  desktopOnly?: boolean;
};

export type TourDef = {
  id: string;
  audience: TourAudience;
  kind: TourKind;
  /** Home route for a page tour (informational; page tours are matched by route-match). */
  route?: string;
  steps: TourStep[];
};

/** Convenience for a full-screen, centered "intro / outro" step. */
function centerStep(
  key: string,
  title: string,
  content: string,
  extra: Partial<TourStep> = {},
): TourStep {
  return { key, target: "body", placement: "center", title, content, ...extra };
}

export const TOURS: Record<string, TourDef> = {
  // ─── Client ────────────────────────────────────────────────────────────
  "client-dashboard": {
    id: "client-dashboard",
    audience: "client",
    kind: "page",
    route: "/dashboard",
    steps: [
      {
        key: "request-service",
        target: '[data-tour="request-service"]',
        title: "Request a service",
        content:
          "Everything starts here — pick a service, tell us what you need, and pay securely. We guide you step by step.",
      },
      {
        key: "active-requests",
        target: '[data-tour="active-requests"]',
        title: "Live progress",
        content:
          "Each active request shows its milestones — payment, documents, work in progress, delivery — so you always know what's next.",
        optional: true,
      },
      {
        key: "billing",
        target: '[data-tour="billing"]',
        title: "Billing & receipts",
        content:
          "Invoices, quotes and receipts live here. Paying online updates everything instantly.",
      },
      {
        key: "quick-actions",
        target: '[data-tour="quick-actions"]',
        title: "Need anything else?",
        content:
          "Book a free consultation or open a support ticket any time — a real person replies quickly.",
      },
    ],
  },

  "client-welcome": {
    id: "client-welcome",
    audience: "client",
    kind: "welcome",
    steps: [
      centerStep(
        "welcome",
        "Welcome to your portal",
        "This is your home base with Litch — request services, track progress, and handle billing all in one place. Here's a 30-second look around.",
      ),
      {
        key: "nav-dashboard",
        target: '[data-tour="nav-dashboard"]',
        title: "Dashboard",
        content: "Your at-a-glance home — active work, recent billing and quick actions.",
        placement: "right",
        desktopOnly: true,
      },
      {
        key: "nav-my-services",
        target: '[data-tour="nav-my-services"]',
        title: "My Services",
        content: "Start a new request or follow every engagement from here.",
        placement: "right",
        desktopOnly: true,
      },
      {
        key: "nav-billing",
        target: '[data-tour="nav-billing"]',
        title: "Billing",
        content: "Invoices, quotes and receipts — pay online and it all updates instantly.",
        placement: "right",
        desktopOnly: true,
      },
      {
        key: "nav-support",
        target: '[data-tour="nav-support"]',
        title: "Support Desk",
        content: "Questions? Open a ticket and a real person gets back to you quickly.",
        placement: "right",
        desktopOnly: true,
      },
      {
        key: "launcher",
        target: '[data-tour="tour-launcher"]',
        title: "Replay any time",
        content:
          "Tap the help button whenever you want a tour of the current page or a full refresher.",
        placement: "bottom",
      },
    ],
  },

  "client-walkthrough": {
    id: "client-walkthrough",
    audience: "client",
    kind: "walkthrough",
    steps: [
      centerStep(
        "intro",
        "Let's take the full tour",
        "We'll move through the portal together — a few seconds on each area. You can skip out at any point.",
        { route: "/dashboard" },
      ),
      {
        key: "request",
        route: "/dashboard/requests",
        target: '[data-tour="request-service"]',
        title: "Request a service",
        content:
          "Browse everything we offer with upfront pricing, then start a guided request in a couple of taps.",
        optional: true,
      },
      centerStep(
        "billing",
        "Billing lives here",
        "Every invoice, quote and receipt is on your Billing page — pay securely online and it reconciles automatically.",
        { route: "/dashboard/invoices" },
      ),
      centerStep(
        "support",
        "We're one click away",
        "Open a support ticket from the Support Desk whenever you need a hand. That's the tour — welcome aboard!",
        { route: "/dashboard/support" },
      ),
    ],
  },

  "client-requests": {
    id: "client-requests",
    audience: "client",
    kind: "page",
    route: "/dashboard/requests",
    steps: [
      {
        key: "request-service",
        target: '[data-tour="request-service"]',
        title: "Start a new request",
        content:
          "Pick a service, tell us what you need and pay securely — we take it from there.",
        optional: true,
      },
    ],
  },

  "client-invoices": {
    id: "client-invoices",
    audience: "client",
    kind: "page",
    route: "/dashboard/invoices",
    steps: [
      centerStep(
        "billing",
        "Billing & receipts",
        "Every invoice, quote and receipt is here. Open one to pay online — your dashboard updates the moment payment clears.",
      ),
    ],
  },

  "client-support": {
    id: "client-support",
    audience: "client",
    kind: "page",
    route: "/dashboard/support",
    steps: [
      centerStep(
        "support",
        "Support Desk",
        "Open a ticket and a real person replies quickly. You'll see every conversation and its status right here.",
      ),
    ],
  },

  // ─── Admin ─────────────────────────────────────────────────────────────
  "admin-dashboard": {
    id: "admin-dashboard",
    audience: "admin",
    kind: "page",
    route: "/admin",
    steps: [
      centerStep(
        "intro",
        "Your command center",
        "Everything that needs your attention surfaces here first. Here's a quick look at the key areas.",
      ),
      {
        key: "kpi-stats",
        target: '[data-tour="kpi-stats"]',
        title: "The numbers",
        content: "Revenue, outstanding balances and pipeline health at a glance.",
        optional: true,
      },
      {
        key: "needs-action",
        target: '[data-tour="needs-action"]',
        title: "Needs your action",
        content: "Quotes to send, payments to confirm and deliveries due — triaged for you.",
        optional: true,
      },
      {
        key: "pipeline",
        target: '[data-tour="pipeline"]',
        title: "The pipeline",
        content: "See where every engagement sits, from new request through to delivered.",
        optional: true,
      },
      {
        key: "recent-activity",
        target: '[data-tour="recent-activity"]',
        title: "Recent activity",
        content: "A live feed of what's happening across clients, invoices and requests.",
        optional: true,
      },
    ],
  },

  "admin-welcome": {
    id: "admin-welcome",
    audience: "admin",
    kind: "welcome",
    steps: [
      centerStep(
        "welcome",
        "Welcome to the Litch admin",
        "This is where you run the firm — requests, clients, finance and LitchAI. Let's take a 30-second tour of the navigation.",
      ),
      {
        key: "nav-dashboard",
        target: '[data-tour="nav-dashboard"]',
        title: "Dashboard",
        content: "Your daily starting point — everything that needs attention, front and center.",
        placement: "right",
        desktopOnly: true,
      },
      {
        key: "nav-requests",
        target: '[data-tour="nav-requests"]',
        title: "Requests",
        content: "Service requests from the portal — quotes to send, work to deliver, payments to watch.",
        placement: "right",
        desktopOnly: true,
      },
      {
        key: "nav-clients",
        target: '[data-tour="nav-clients"]',
        title: "Clients",
        content: "Your client directory — profiles, history and everything you bill them on.",
        placement: "right",
        desktopOnly: true,
      },
      {
        key: "nav-finance",
        target: '[data-tour="nav-finance"]',
        title: "Finance",
        content: "Invoices, receipts and the money side of the business all live here.",
        placement: "right",
        desktopOnly: true,
      },
      {
        key: "nav-litchai",
        target: '[data-tour="nav-litchai"]',
        title: "LitchAI",
        content: "The AI studio that compiles client documents into formula-driven Excel models.",
        placement: "right",
        desktopOnly: true,
      },
      {
        key: "launcher",
        target: '[data-tour="tour-launcher"]',
        title: "Replay any time",
        content:
          "Use the help button for a tour of the current page or the full platform walkthrough.",
        placement: "bottom",
      },
    ],
  },

  "admin-walkthrough": {
    id: "admin-walkthrough",
    audience: "admin",
    kind: "walkthrough",
    steps: [
      centerStep(
        "intro",
        "The full platform walkthrough",
        "We'll hop across the core pages together — a moment on each. Skip out whenever you like.",
        { route: "/admin" },
      ),
      {
        key: "requests",
        route: "/admin/requests",
        target: '[data-tour="requests-table"]',
        title: "Requests",
        content:
          "Every service request from the portal lands here. Open one to quote, deliver, or take payment.",
        optional: true,
      },
      {
        key: "clients",
        route: "/admin/clients",
        target: '[data-tour="clients-table"]',
        title: "Clients",
        content: "Your directory of clients — open a profile to see history, invoices and requests.",
        optional: true,
      },
      centerStep(
        "finance",
        "Money lives here",
        "Build invoices and receipts, send them, and track what's paid — all from Finance.",
        { route: "/admin/finance/invoices" },
      ),
      centerStep(
        "litchai",
        "Meet the AI Studio",
        "LitchAI turns raw client documents into polished, formula-driven Excel models. That's the tour!",
        { route: "/admin/litchai" },
      ),
    ],
  },

  "admin-requests": {
    id: "admin-requests",
    audience: "admin",
    kind: "page",
    route: "/admin/requests",
    steps: [
      {
        key: "requests-status-tabs",
        target: '[data-tour="requests-status-tabs"]',
        title: "Filter your queue",
        content: "Switch between open work, items needing action, and the full history.",
        placement: "bottom",
        optional: true,
      },
      {
        key: "requests-table",
        target: '[data-tour="requests-table"]',
        title: "The request list",
        content: "Every request with its client, service, amount and status. Open one to act on it.",
        optional: true,
      },
    ],
  },

  "admin-clients": {
    id: "admin-clients",
    audience: "admin",
    kind: "page",
    route: "/admin/clients",
    steps: [
      {
        key: "clients-table",
        target: '[data-tour="clients-table"]',
        title: "Your client directory",
        content:
          "Search and open any client to see their profile, invoices and request history in one place.",
        optional: true,
      },
    ],
  },
};

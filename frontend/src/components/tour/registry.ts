import type { Step } from "react-joyride";
import type { TourIconName } from "./tour-icon";

/**
 * Tour registry — the single source of truth for every guided tour in the app.
 *
 * A `TourStep` is a react-joyride `Step` plus a few Litch-specific fields:
 *  - `key`          stable id for the step (debugging / React keys)
 *  - `route`        walkthrough steps that live on another page set this; the
 *                   provider decorates them with a `before` hook that navigates
 *                   there and waits for the target to mount.
 *  - `page`         friendly page name, shown in the tooltip and used to count
 *                   "N pages to go" in the walkthroughs.
 *  - `optional`     the step is dropped silently if its target isn't in the DOM
 *                   (empty tables, unconfigured cards, …).
 *  - `desktopOnly`  dropped below the `lg` breakpoint — the sidebar rail is
 *                   `hidden lg:block`, so its anchors exist but are invisible.
 *  - `mobileOnly`   dropped at `lg` and up (e.g. the drawer's hamburger).
 *  - `icon`         animated tooltip icon (see `tour-icon.tsx`).
 *  - `interact`     interactive stop: the user clicks the target and the tour
 *                   advances itself. The Next button still works as a fallback.
 *  - `showEstimate` render the "~3 min · 12 stops" chip (intro steps only).
 *
 * Copy rule: say what is *actually* on the page and what the operator can do
 * with it. No filler, no "this is the dashboard".
 */
export type TourAudience = "client" | "admin" | "staff";
export type TourKind = "page" | "welcome" | "walkthrough";

export type TourStep = Step & {
  key: string;
  route?: string;
  page?: string;
  optional?: boolean;
  desktopOnly?: boolean;
  mobileOnly?: boolean;
  icon?: TourIconName;
  interact?: { hint: string; clickTarget?: string };
  showEstimate?: boolean;
};

export type TourDef = {
  id: string;
  audience: TourAudience;
  kind: TourKind;
  /** Home route for a page tour (informational; page tours are matched by route-match). */
  route?: string;
  /**
   * Bump when the copy or stops change enough to show again. Completion is
   * stored per user and version on the server (user_onboarding.tours), so a
   * finished tour stays finished on every device until its version moves.
   */
  version?: number;
  steps: TourStep[];
};

/** Convenience for a full-screen, centered "intro / outro" step. */
function centerStep(
  key: string,
  title: string,
  content: string,
  extra: Partial<TourStep> = {},
): TourStep {
  return {
    key,
    target: "body",
    placement: "center",
    // Centered steps have nothing to scroll to — joyride skips scrolling for
    // `placement: center` anyway, but being explicit keeps intent obvious.
    skipScroll: true,
    title,
    content,
    ...extra,
  };
}

/** A sidebar nav anchor. Desktop-only: the rail is `hidden` below `lg`. */
function navStep(
  tourKey: string,
  title: string,
  content: string,
  extra: Partial<TourStep> = {},
): TourStep {
  return {
    key: `nav-${tourKey}`,
    target: `[data-tour="nav-${tourKey}"]`,
    placement: "right",
    desktopOnly: true,
    title,
    content,
    ...extra,
  };
}

export const TOURS: Record<string, TourDef> = {
  // ─── Client · page tours (v2: the portal rebuilt around "what needs you") ───
  "client-dashboard": {
    id: "client-dashboard",
    audience: "client",
    kind: "page",
    version: 2,
    route: "/dashboard",
    steps: [
      {
        key: "attention",
        target: '[data-tour="attention"]',
        title: "What needs you",
        content: "Anything waiting on you sits here first: a quote to accept, a payment, a document we asked for, a draft to review. Everything else is with us.",
        icon: "flag",
        optional: true,
      },
      {
        key: "new-request",
        target: '[data-tour="new-request"]',
        title: "Request a service",
        content: "Choose a service, tell us about the work and we send a quote. You are never charged before you accept it.",
        icon: "plus",
        optional: true,
      },
      {
        key: "onboarding",
        target: '[data-tour="onboarding"]',
        title: "Finish setting up",
        content: "Your company details go on every quote and invoice. Hide this list until tomorrow, or close it once you are done.",
        icon: "check",
        optional: true,
      },
    ],
  },

  "client-requests": {
    id: "client-requests",
    audience: "client",
    kind: "page",
    version: 2,
    route: "/dashboard/requests",
    steps: [
      centerStep(
        "intro",
        "Your requests",
        "Every piece of work with us, with whose move it is and the next step. Open one for its timeline, the files, our questions and the draft when it is ready.",
        { icon: "inbox" },
      ),
      {
        key: "request-again",
        target: '[data-tour="request-again"]',
        title: "Same again next period",
        content: "Start a follow-on request from finished work. Your files can come with it, so we do not ask twice.",
        icon: "replay",
        optional: true,
      },
    ],
  },

  "client-request-new": {
    id: "client-request-new",
    audience: "client",
    kind: "page",
    version: 2,
    route: "/dashboard/requests/new",
    steps: [
      {
        key: "service-picker",
        target: '[data-tour="service-picker"]',
        title: "Pick a service",
        content: "Fixed-price services can be paid straight away. Anything marked “Get a quote” gets a figure from us first.",
        icon: "pointer",
        optional: true,
      },
    ],
  },

  "client-billing": {
    id: "client-billing",
    audience: "client",
    kind: "page",
    version: 1,
    route: "/dashboard/billing",
    steps: [
      centerStep(
        "intro",
        "Billing",
        "Quotes to accept, invoices to pay and receipts, in one list. Pay by card through Paystack, or by transfer: we confirm transfers and the receipt follows by email.",
        { icon: "wallet" },
      ),
    ],
  },

  "client-files": {
    id: "client-files",
    audience: "client",
    kind: "page",
    version: 1,
    route: "/dashboard/files",
    steps: [
      centerStep(
        "intro",
        "Files",
        "Everything you sent us and everything we delivered, across all your requests. Downloads are private links that only work for your account.",
        { icon: "fileStack" },
      ),
    ],
  },

  "client-support": {
    id: "client-support",
    audience: "client",
    kind: "page",
    version: 2,
    route: "/dashboard/support",
    steps: [
      {
        key: "support-kb",
        target: '[data-tour="support-kb"]',
        title: "Try a search first",
        content: "Most questions about payments, documents and timelines have an answer here already.",
        icon: "search",
        optional: true,
      },
      {
        key: "support-contact",
        target: '[data-tour="support-contact"]',
        title: "Or ask us directly",
        content: "Open a ticket and the team replies here and by email, in the same thread.",
        icon: "send",
        optional: true,
      },
      {
        key: "support-view",
        target: '[data-tour="support-view"]',
        title: "Your tickets",
        content: "Every conversation with its status. Reply in the thread any time.",
        icon: "lifeBuoy",
        optional: true,
      },
    ],
  },

  "client-notifications": {
    id: "client-notifications",
    audience: "client",
    kind: "page",
    version: 1,
    route: "/dashboard/notifications",
    steps: [
      centerStep(
        "intro",
        "Notifications",
        "Everything we told you, newest first. Choose per kind of event whether it reaches you by email, push or only here.",
        { icon: "bell" },
      ),
    ],
  },

  "client-settings": {
    id: "client-settings",
    audience: "client",
    kind: "page",
    version: 2,
    route: "/dashboard/settings",
    steps: [
      centerStep(
        "intro",
        "Settings",
        "Your company details for invoices, your colleagues and what they can do, and email preferences. Password, two-step and devices live in Profile and security.",
        { icon: "settings" },
      ),
    ],
  },

  // ─── Client · welcome + walkthrough ────────────────────────────────────
  "client-welcome": {
    id: "client-welcome",
    audience: "client",
    kind: "welcome",
    version: 2,
    steps: [
      centerStep(
        "welcome",
        "Welcome to Litch",
        "Your requests, quotes, invoices and files in one place. Here is where things are.",
        { icon: "sparkles", showEstimate: true },
      ),
      navStep("home", "Home", "What needs you right now. If it is empty, everything is with us.", { icon: "layout" }),
      navStep("requests", "Requests", "Every piece of work, its timeline and its files.", { icon: "inbox" }),
      navStep("billing", "Billing", "Quotes, invoices and receipts. Pay by card or transfer.", { icon: "wallet" }),
      navStep("files", "Files", "Everything you sent and everything we delivered.", { icon: "fileStack" }),
      navStep("support", "Support", "Ask us anything; replies come here and by email.", { icon: "lifeBuoy" }),
      {
        key: "mobile-menu",
        target: '[data-tour="tab-home"]',
        title: "Your menu",
        content: "The bar at the bottom reaches every section on a phone.",
        placement: "top",
        icon: "panelLeft",
        mobileOnly: true,
        optional: true,
      },
      {
        key: "launcher",
        target: '[data-tour="tour-launcher"]',
        title: "Replay any time",
        content: "The help button gives you a tour of whatever page you are on.",
        placement: "bottom",
        icon: "replay",
        optional: true,
      },
    ],
  },

  "client-walkthrough": {
    id: "client-walkthrough",
    audience: "client",
    kind: "walkthrough",
    version: 2,
    steps: [
      centerStep("intro", "A walk around the portal", "We visit each part once. Step out whenever you like.", {
        route: "/dashboard",
        page: "Home",
        icon: "compass",
        showEstimate: true,
      }),
      {
        key: "dash-attention",
        route: "/dashboard",
        page: "Home",
        target: '[data-tour="attention"]',
        title: "What needs you",
        content: "Quotes to accept, payments, documents we asked for and drafts to review land here first.",
        icon: "flag",
        optional: true,
      },
      centerStep("requests", "Requests", "Each request shows its timeline, our questions, the files and the draft when it is ready.", {
        route: "/dashboard/requests",
        page: "Requests",
        icon: "inbox",
      }),
      centerStep("billing", "Billing", "Accept a quote, pay in full or a 50% deposit, and download receipts.", {
        route: "/dashboard/billing",
        page: "Billing",
        icon: "wallet",
      }),
      centerStep("files", "Files", "Upload what we ask for; collect what we deliver. Links are private to your account.", {
        route: "/dashboard/files",
        page: "Files",
        icon: "fileStack",
      }),
      {
        key: "support",
        route: "/dashboard/support",
        page: "Support",
        target: '[data-tour="support-view"]',
        title: "Support",
        content: "Your tickets and our replies, in one thread each.",
        icon: "lifeBuoy",
        optional: true,
      },
      centerStep("outro", "That's the portal", "The help button in the top bar replays any of this whenever you want it.", {
        route: "/dashboard",
        page: "Home",
        icon: "check",
      }),
    ],
  },

  // ─── Staff · /work ─────────────────────────────────────────────────────
  "staff-home": {
    id: "staff-home",
    audience: "staff",
    kind: "page",
    version: 1,
    route: "/work",
    steps: [
      {
        key: "attention",
        target: '[data-tour="attention"]',
        title: "What needs you",
        content: "Supplied documents to check, client replies and deadlines on the requests assigned to you, worst first.",
        icon: "flag",
        optional: true,
      },
      {
        key: "onboarding",
        target: '[data-tour="onboarding"]',
        title: "Getting started",
        content: "Profile, alerts and two-step. Hide the list until tomorrow or close it when you are done.",
        icon: "check",
        optional: true,
      },
    ],
  },

  "staff-requests": {
    id: "staff-requests",
    audience: "staff",
    kind: "page",
    version: 1,
    route: "/work/requests",
    steps: [
      centerStep(
        "intro",
        "My requests",
        "Only the requests an Admin assigned to you. Open one to ask the client for documents, upload the draft for review and deliver the final. Amounts and billing stay with Admin.",
        { icon: "inbox" },
      ),
    ],
  },

  "staff-analyses": {
    id: "staff-analyses",
    audience: "staff",
    kind: "page",
    version: 1,
    route: "/work/analyses",
    steps: [
      centerStep(
        "intro",
        "Files",
        "Client documents and the workbooks compiled from them, for your requests only. Nothing unverified reaches a client.",
        { icon: "fileStack" },
      ),
    ],
  },

  "staff-conversations": {
    id: "staff-conversations",
    audience: "staff",
    kind: "page",
    version: 1,
    route: "/work/conversations",
    steps: [
      centerStep(
        "intro",
        "Conversations",
        "Client messages on your requests, one thread per request. Replies reach the client in their portal and by email.",
        { icon: "send" },
      ),
    ],
  },

  "staff-notifications": {
    id: "staff-notifications",
    audience: "staff",
    kind: "page",
    version: 1,
    route: "/work/notifications",
    steps: [
      centerStep(
        "intro",
        "Notifications",
        "New assignments, supplied documents and client replies. Choose per kind of event how each one reaches you.",
        { icon: "bell" },
      ),
    ],
  },

  "staff-welcome": {
    id: "staff-welcome",
    audience: "staff",
    kind: "welcome",
    version: 1,
    steps: [
      centerStep("welcome", "Your workspace", "Two minutes on where your work lives.", { icon: "sparkles", showEstimate: true }),
      navStep("home", "My work", "What needs you on your assignments, worst first.", { icon: "layout" }),
      navStep("requests", "My requests", "Only what an Admin assigned to you, with the client's files and asks.", { icon: "inbox" }),
      navStep("analyses", "Files", "Documents and compiled workbooks for your requests.", { icon: "fileStack" }),
      navStep("conversations", "Conversations", "Client messages, one thread per request.", { icon: "send" }),
      {
        key: "bell",
        target: '[data-tour="bell"]',
        title: "The bell",
        content: "New assignments and client replies. Email and push follow your alert settings.",
        placement: "bottom",
        icon: "bell",
        optional: true,
      },
      {
        key: "mobile-menu",
        target: '[data-tour="tab-home"]',
        title: "Your menu",
        content: "The bar at the bottom reaches every section on a phone.",
        placement: "top",
        icon: "panelLeft",
        mobileOnly: true,
        optional: true,
      },
    ],
  },

  // ─── Admin · page tours ────────────────────────────────────────────────
  "admin-dashboard": {
    id: "admin-dashboard",
    audience: "admin",
    kind: "page",
    route: "/admin",
    steps: [
      centerStep(
        "intro",
        "Your command center",
        "Everything that needs your attention surfaces here first. Here's what each block is telling you.",
        { icon: "compass", showEstimate: true },
      ),
      {
        key: "kpi-stats",
        target: '[data-tour="kpi-stats"]',
        title: "The five numbers",
        content:
          "Open requests, total invoiced, paid, outstanding and overdue. If “Overdue” is climbing, start your day in Finance.",
        icon: "gauge",
        optional: true,
      },
      {
        key: "needs-action",
        target: '[data-tour="needs-action"]',
        title: "Needs your action",
        content:
          "Your worklist — quotes to send, payments to confirm, deliveries due. Everything blocked on *you*, triaged, newest first. Clear this and the day's done.",
        icon: "flag",
        optional: true,
      },
      {
        key: "pipeline",
        target: '[data-tour="pipeline"]',
        title: "The requests pipeline",
        content:
          "Every active request by stage — quote requested, pending payment, awaiting documents, in progress, in review, delivered. Click any stage to open that filtered list.",
        icon: "activity",
        optional: true,
      },
      {
        key: "billed-collected",
        target: '[data-tour="billed-collected"]',
        title: "Billed vs collected",
        content:
          "Six months of invoicing against cash actually received. A widening gap between the bars means work is going out faster than money is coming in.",
        icon: "barChart",
        optional: true,
      },
      {
        key: "recent-activity",
        target: '[data-tour="recent-activity"]',
        title: "Payment activity",
        content:
          "Live Paystack traffic. Anything flagged — an amount mismatch or a duplicate — is surfaced first, because those need a human.",
        icon: "creditCard",
        optional: true,
      },
      {
        key: "quick-actions",
        target: '[data-tour="quick-actions"]',
        title: "Quick actions",
        content: "The four jumps you'll make most: new invoice, clients, reports, receipts.",
        icon: "pointer",
        optional: true,
      },
      {
        key: "consultations",
        target: '[data-tour="consultations"]',
        title: "The week ahead",
        content:
          "Consultations booked through the scheduler on /book, with one-tap join links. They land here automatically.",
        icon: "clock",
        optional: true,
      },
      {
        key: "ar-aging",
        target: '[data-tour="ar-aging"]',
        title: "Receivables aging",
        content:
          "Who owes you and for how long, bucketed from current out to 90+ days. The further right the money sits, the harder it gets to collect.",
        icon: "clock",
        optional: true,
      },
      {
        key: "collection-rate",
        target: '[data-tour="collection-rate"]',
        title: "Collection rate",
        content:
          "The share of everything you've invoiced that's actually been paid, plus this month's billing. The one number that tells you if the practice is healthy.",
        icon: "badgeCheck",
        optional: true,
      },
    ],
  },

  "admin-requests": {
    id: "admin-requests",
    audience: "admin",
    kind: "page",
    route: "/admin/requests",
    steps: [
      {
        key: "requests-stats",
        target: '[data-tour="requests-stats"]',
        title: "Queue health",
        content:
          "Open, awaiting quote or payment, awaiting documents, and delivered-but-unclosed. The last one is the easiest revenue to lose track of.",
        icon: "gauge",
        optional: true,
      },
      {
        key: "requests-status-tabs",
        target: '[data-tour="requests-status-tabs"]',
        title: "Filter your queue",
        content:
          "Switch between Service requests and Consultations, then narrow to Open, Needs action, or All. “Needs action” is the one to live in.",
        placement: "bottom",
        icon: "filter",
        optional: true,
      },
      {
        key: "requests-table",
        target: '[data-tour="requests-table"]',
        title: "The request list",
        content:
          "Every request with its client, service, amount, status and age. Open one to quote it, chase documents, deliver the work, or take payment.",
        icon: "inbox",
        optional: true,
      },
      {
        key: "service-catalog",
        target: '[data-tour="service-catalog"]',
        title: "Service catalog",
        content:
          "Set pricing, VAT, turnaround and the required-documents checklist per service. Changes apply to new requests only — work in flight keeps its snapshot.",
        icon: "settings",
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
          "Search, sort and export every client. Open a profile for their history, invoices and requests in one place — or select rows to act on several at once.",
        icon: "users",
        optional: true,
      },
      {
        key: "new-client",
        target: '[data-tour="new-client"]',
        title: "Adding a client",
        content:
          "Add one by hand here — or just bill someone on an invoice and they'll appear in this directory automatically.",
        icon: "plus",
        optional: true,
      },
    ],
  },

  "admin-reports": {
    id: "admin-reports",
    audience: "admin",
    kind: "page",
    route: "/admin/reports",
    steps: [
      centerStep(
        "intro",
        "Reports",
        "Seven views over the same invoice data: Overview, Revenue, Collections, Receivables aging, Tax/VAT, Clients and Monthly summary. Pick a tab to change the question you're asking.",
        { icon: "barChart" },
      ),
      centerStep(
        "collections",
        "The two that matter most",
        "Collections gives you the rate and average days-to-pay — how quickly money actually arrives. Receivables aging shows what's gone stale. Together they explain almost every cash-flow surprise.",
        { icon: "handshake" },
      ),
      centerStep(
        "tax",
        "Tax / VAT",
        "The VAT you've charged and the taxable base behind it, drawn from real invoices — the working you'd otherwise rebuild by hand at filing time.",
        { icon: "receipt" },
      ),
    ],
  },

  "admin-billing": {
    id: "admin-billing",
    audience: "admin",
    kind: "page",
    version: 2,
    route: "/admin/billing",
    steps: [
      {
        key: "finance-tabs",
        target: '[data-tour="finance-tabs"]',
        title: "Billing",
        content: "Four sections: quotes and invoices in one list, payments to confirm, expenses, and the tools (models, calculators, templates).",
        placement: "bottom",
        icon: "wallet",
        optional: true,
      },
      {
        key: "invoice-stats",
        target: '[data-tour="invoice-stats"]',
        title: "Where the money is",
        content: "Quotes waiting, unpaid, late and part paid. Each figure opens the list filtered to it.",
        icon: "gauge",
        optional: true,
      },
      {
        key: "invoices-table",
        target: '[data-tour="invoices-table"]',
        title: "One list",
        content: "Quotes, invoices and receipts together. A quote becomes an invoice when the client accepts it; a receipt is made when it is paid. Totals are always recomputed on the server.",
        icon: "fileText",
        optional: true,
      },
    ],
  },

  "admin-billing-payments": {
    id: "admin-billing-payments",
    audience: "admin",
    kind: "page",
    version: 1,
    route: "/admin/billing/payments",
    steps: [
      centerStep(
        "intro",
        "Payments",
        "Card payments confirm themselves through Paystack. Transfers wait here until you match them to an invoice; confirming sends the client a receipt.",
        { icon: "creditCard" },
      ),
    ],
  },

  "admin-billing-expenses": {
    id: "admin-billing-expenses",
    audience: "admin",
    kind: "page",
    version: 1,
    route: "/admin/billing/expenses",
    steps: [
      centerStep(
        "intro",
        "Expenses",
        "Log what the firm spends. Revenue comes from collected invoices on its own, so profit and margin net off without a second ledger.",
        { icon: "calculator" },
      ),
    ],
  },

  "admin-models": {
    id: "admin-models",
    audience: "admin",
    kind: "page",
    route: "/admin/billing/tools",
    steps: [
      centerStep(
        "intro",
        "Financial models",
        "An interactive workbench — NPV/IRR, cash-flow projections and sensitivity. Import a CSV or start from scratch, then explore the reference portfolios below for a starting shape.",
        { icon: "barChart" },
      ),
    ],
  },

  "admin-calculators": {
    id: "admin-calculators",
    audience: "admin",
    kind: "page",
    route: "/admin/billing/calculators",
    steps: [
      centerStep(
        "intro",
        "Calculators",
        "Nigerian finance calculators for the 2026 tax year — income tax and take-home pay, pension, VAT, loans, mortgages and import duty. They read the same versioned NTA-2025 rate config the compilers do, so a rate is never hardcoded twice.",
        { icon: "calculator" },
      ),
    ],
  },

  "admin-blog": {
    id: "admin-blog",
    audience: "admin",
    kind: "page",
    route: "/admin/blog",
    steps: [
      {
        key: "posts-list",
        target: '[data-tour="posts-list"]',
        title: "Insights posts",
        content:
          "Every article with its status. Drafts stay private until you publish; published posts appear on the public Insights page immediately.",
        icon: "penSquare",
        optional: true,
      },
      {
        key: "new-post",
        target: '[data-tour="new-post"]',
        title: "Writing a post",
        content:
          "The editor handles the SEO fields — title, slug, excerpt and cover — alongside the body, so a post is publish-ready without a second pass.",
        icon: "plus",
        optional: true,
      },
    ],
  },

  "admin-templates": {
    id: "admin-templates",
    audience: "admin",
    kind: "page",
    route: "/admin/billing/templates",
    steps: [
      {
        key: "templates-view",
        target: '[data-tour="templates-view"]',
        title: "Templates",
        content:
          "Import a workbook once and reuse it forever. “Your templates” are the ones you've imported — preview, download, copy a share link, or delete. The starter library below gives you branded models to build from.",
        icon: "fileStack",
        optional: true,
      },
    ],
  },

  "admin-litchai": {
    id: "admin-litchai",
    audience: "admin",
    kind: "page",
    route: "/admin/analyses",
    steps: [
      {
        key: "litchai-studio",
        target: '[data-tour="analyses-studio"]',
        title: "Analyses",
        content:
          "Every LitchAI analysis, grouped by client. Send a client's documents for analysis from their request page and the pipeline compiles them into a formula-driven workbook — every number traceable, every formula verified before it can reach a client.",
        icon: "bot",
        optional: true,
      },
      centerStep(
        "review",
        "Lines needing review",
        "The counter up top is the one to watch: anything the pipeline couldn't categorise with confidence waits for a human before it can be published. Nothing unverified ever reaches a client.",
        { icon: "shieldCheck" },
      ),
      centerStep(
        "observability",
        "Observability",
        "The Observability link tracks pipeline health — documents processed, rejections, review backlog, and the rung-4 fallback rate. A rising fallback rate means the categoriser is guessing more than it should.",
        { icon: "activity" },
      ),
    ],
  },

  "admin-litchai-observability": {
    id: "admin-litchai-observability",
    audience: "admin",
    kind: "page",
    route: "/admin/analyses/observability",
    steps: [
      centerStep(
        "intro",
        "Pipeline health",
        "Documents processed, how many were rejected, the review backlog, and the rung-4 fallback rate — plus per-rung hit rates below. Fallback climbing is your early warning that the categoriser needs attention.",
        { icon: "activity" },
      ),
    ],
  },

  "admin-assistant": {
    id: "admin-assistant",
    audience: "admin",
    kind: "page",
    route: "/admin/sage",
    steps: [
      centerStep(
        "intro",
        "Sage",
        "Ask questions in plain English across the firm's knowledge base — services, FAQs and internal SOPs — or scope it to one client and ask about their actual data.",
        { icon: "sparkles" },
      ),
      centerStep(
        "scope",
        "Pick your scope",
        "Leave it unscoped for firm-wide policy and process questions. Choose a client and it answers against their records instead — useful before a call, when you want the history without digging.",
        { icon: "users" },
      ),
    ],
  },

  "admin-settings": {
    id: "admin-settings",
    audience: "admin",
    kind: "page",
    route: "/admin/settings",
    steps: [
      centerStep(
        "intro",
        "Settings",
        "Your organisation profile: company name, logo, bank details, the from-address invoices are sent on, default currency and standard invoice terms.",
        { icon: "settings" },
      ),
      centerStep(
        "invoices",
        "This is what clients see",
        "Everything here flows straight onto the invoices, receipts and pay pages your clients receive — the bank details especially. Leave a field blank and we fall back to the Litch defaults.",
        { icon: "receipt" },
      ),
      centerStep(
        "users",
        "User access",
        "The user list controls who gets into this admin. Sign-ups and passwords are handled by the auth layer — you're granting and revoking the admin role here.",
        { icon: "shieldCheck" },
      ),
    ],
  },

  "admin-integrations": {
    id: "admin-integrations",
    audience: "admin",
    kind: "page",
    route: "/admin/settings/integrations",
    steps: [
      {
        key: "integrations-grid",
        target: '[data-tour="integrations-grid"]',
        title: "Connected services",
        content:
          "The five services Litch runs on — email, R2 storage, the database, Google sign-in and Paystack. Each card reads its own environment config live, so “Connected” means it's genuinely wired, not just intended.",
        icon: "cable",
        optional: true,
      },
      centerStep(
        "config",
        "Changing them",
        "These are configured by environment variables, not in the UI — so a mis-click can never take payments or email offline. If one says “Not configured”, its keys aren't set.",
        { icon: "shieldCheck" },
      ),
    ],
  },

  "admin-help-desk": {
    id: "admin-help-desk",
    audience: "admin",
    kind: "page",
    route: "/admin/help-desk",
    steps: [
      {
        key: "helpdesk-view",
        target: '[data-tour="helpdesk-view"]',
        title: "Help Desk",
        content:
          "Every client ticket in one inbox. Filter by status, priority or category, or search. Switch between the inbox and table views with the toggle — inbox to work a conversation, table to triage in bulk.",
        icon: "lifeBuoy",
        optional: true,
      },
      centerStep(
        "assign",
        "Working a ticket",
        "Open one to reply, set its priority and assign it to an admin. The client sees your replies in their Support Desk — same thread, no email ping-pong.",
        { icon: "send" },
      ),
    ],
  },

  "admin-audit": {
    id: "admin-audit",
    audience: "admin",
    kind: "page",
    route: "/admin/audit",
    steps: [
      centerStep(
        "intro",
        "Audit log",
        "Every destructive and important admin action — who did it, to what, and when. Newest first, last 250. Filter by entity or action to answer “what happened to this invoice?” in seconds.",
        { icon: "shieldCheck" },
      ),
    ],
  },

  "admin-services": {
    id: "admin-services",
    audience: "admin",
    kind: "page",
    route: "/admin/services",
    steps: [
      {
        key: "services-editor",
        target: '[data-tour="services-editor"]',
        title: "Service catalog",
        content:
          "The commercial side of every service: pricing mode, price, VAT rate, turnaround copy and the required-documents checklist clients get asked for.",
        icon: "briefcase",
        optional: true,
      },
      centerStep(
        "snapshots",
        "Safe to change",
        "Edits go live immediately for *new* requests only. Work already in flight keeps the price and document list it was created with, so nobody's quote moves under them.",
        { icon: "shieldCheck" },
      ),
    ],
  },

  "admin-trash": {
    id: "admin-trash",
    audience: "admin",
    kind: "page",
    route: "/admin/trash",
    steps: [
      centerStep(
        "intro",
        "Trash",
        "Deleted records rest here for 30 days — restore anything, or remove it for good. A sweep cron purges the rest, so a mis-click is never final.",
        { icon: "trash" },
      ),
    ],
  },

  "admin-notifications": {
    id: "admin-notifications",
    audience: "admin",
    kind: "page",
    route: "/admin/notifications",
    steps: [
      centerStep(
        "intro",
        "Notifications",
        "Recent activity across the practice — new leads, invoices sent and paid, tickets, requests, payments and bookings. Every row deep-links to the thing it's about.",
        { icon: "bell" },
      ),
    ],
  },

  // ─── Admin · welcome + walkthrough ─────────────────────────────────────
  "admin-welcome": {
    id: "admin-welcome",
    audience: "admin",
    kind: "welcome",
    version: 2,
    steps: [
      centerStep(
        "welcome",
        "Welcome to the Litch admin",
        "This is where you run the firm — requests, clients, billing and LitchAI. Let's get you oriented on the navigation.",
        { icon: "sparkles", showEstimate: true },
      ),
      navStep(
        "dashboard",
        "Dashboard",
        "Your daily starting point — everything that needs attention, front and center.",
        { icon: "layout" },
      ),
      navStep(
        "requests",
        "Requests",
        "Service requests from the portal — quotes to send, work to deliver, payments to watch.",
        { icon: "inbox" },
      ),
      navStep(
        "clients",
        "Clients",
        "Your client directory — profiles, history and everything you bill them on.",
        { icon: "users" },
      ),
      navStep("finance", "Billing", "Quotes, invoices and receipts in one list, payments to confirm, expenses and the tools.", {
        icon: "wallet",
      }),
      navStep(
        "litchai",
        "LitchAI",
        "The AI studio that compiles client documents into formula-driven Excel models.",
        { icon: "bot" },
      ),
      {
        key: "sidebar-pin",
        target: '[data-tour="sidebar-pin"]',
        title: "Give yourself more room",
        content:
          "This collapses the sidebar to a slim icon rail. It stays that way until you bring it back — and hovering the rail peeks it open when you need a label.",
        placement: "right",
        icon: "panelLeft",
        desktopOnly: true,
        optional: true,
        interact: { hint: "Click the collapse button to try it" },
      },
      {
        key: "mobile-menu",
        target: '[data-tour="mobile-menu"]',
        title: "Your menu",
        content: "Tap here to reach every section — the sidebar lives behind this on a phone.",
        placement: "bottom",
        icon: "panelLeft",
        mobileOnly: true,
        optional: true,
      },
      {
        key: "launcher",
        target: '[data-tour="tour-launcher"]',
        title: "Replay any time",
        content:
          "The help button gives you a tour of whatever page you're on, or the full platform walkthrough.",
        placement: "bottom",
        icon: "replay",
      },
    ],
  },

  "admin-walkthrough": {
    id: "admin-walkthrough",
    audience: "admin",
    kind: "walkthrough",
    version: 2,
    steps: [
      centerStep(
        "intro",
        "The full platform walkthrough",
        "We'll visit every part of the admin together and I'll tell you what each page is for. Step out whenever you like — the help button brings it back.",
        { route: "/admin", page: "Dashboard", icon: "compass", showEstimate: true },
      ),
      {
        key: "dash-attention",
        route: "/admin",
        page: "Dashboard",
        target: '[data-tour="needs-action"]',
        title: "Start here every morning",
        content:
          "Your worklist — quotes to send, payments to confirm, deliveries due. Everything blocked on you, triaged. Clear it and the day's done.",
        icon: "flag",
        optional: true,
      },
      {
        key: "dash-pipeline",
        route: "/admin",
        page: "Dashboard",
        target: '[data-tour="pipeline"]',
        title: "The pipeline",
        content:
          "Every active request by stage. Click a stage to jump straight into that filtered list.",
        icon: "activity",
        optional: true,
      },
      {
        key: "dash-kpis",
        route: "/admin",
        page: "Dashboard",
        target: '[data-tour="kpi-stats"]',
        title: "The money, briefly",
        content:
          "Invoiced, paid, outstanding, overdue. If overdue is climbing, your day starts in Billing instead.",
        icon: "gauge",
        optional: true,
      },
      {
        key: "go-requests",
        route: "/admin",
        page: "Dashboard",
        target: '[data-tour="nav-requests"]',
        title: "On to Requests",
        content: "Let's look at where client work actually arrives.",
        placement: "right",
        icon: "pointer",
        desktopOnly: true,
        interact: { hint: "Click “Requests” in the sidebar" },
      },
      {
        key: "requests-tabs",
        route: "/admin/requests",
        page: "Requests",
        target: '[data-tour="requests-status-tabs"]',
        title: "Requests",
        content:
          "Service requests and consultations, filtered to Open, Needs action, or All. “Needs action” is the view to live in.",
        placement: "bottom",
        icon: "filter",
        optional: true,
      },
      {
        key: "requests-table",
        route: "/admin/requests",
        page: "Requests",
        target: '[data-tour="requests-table"]',
        title: "The queue",
        content:
          "Every request from the portal with its client, service, amount, status and age. Open one to quote, chase documents, deliver, or take payment.",
        icon: "inbox",
        optional: true,
      },
      {
        key: "go-clients",
        route: "/admin/requests",
        page: "Requests",
        target: '[data-tour="nav-clients"]',
        title: "On to Clients",
        content: "Every request belongs to somebody — that's next.",
        placement: "right",
        icon: "pointer",
        desktopOnly: true,
        interact: { hint: "Click “Clients” in the sidebar" },
      },
      {
        key: "clients-table",
        route: "/admin/clients",
        page: "Clients",
        target: '[data-tour="clients-table"]',
        title: "Clients",
        content:
          "Search, sort and export the directory. Open a profile for history, invoices and requests together. Bill someone on an invoice and they land here automatically.",
        icon: "users",
        optional: true,
      },
      centerStep(
        "reports",
        "Reports",
        "Seven views over your invoice data: Overview, Revenue, Collections, Receivables aging, Tax/VAT, Clients, Monthly summary. Collections and aging are the two that explain most cash-flow surprises.",
        { route: "/admin/reports", page: "Reports", icon: "barChart" },
      ),
      {
        key: "invoices-table",
        route: "/admin/billing",
        page: "Billing",
        target: '[data-tour="invoices-table"]',
        title: "Billing",
        content:
          "Quotes, invoices and receipts in one list, with whose move it is. A quote becomes an invoice on acceptance; a receipt is made when it is paid.",
        icon: "wallet",
        optional: true,
      },
      {
        key: "finance-tabs",
        route: "/admin/billing",
        page: "Billing",
        target: '[data-tour="finance-tabs"]',
        title: "The rest of Billing",
        content:
          "Payments holds transfers to confirm. Expenses nets what the firm spends against collected revenue. Tools has the models, the NTA-2025 calculators and workbook templates.",
        placement: "bottom",
        icon: "calculator",
        optional: true,
      },
      centerStep(
        "blog",
        "Blog",
        "Write and publish Insights articles — the editor covers the SEO fields alongside the body, so a post goes out publish-ready. Drafts stay private until you say so.",
        { route: "/admin/blog", page: "Blog", icon: "penSquare" },
      ),
      centerStep(
        "templates",
        "Templates",
        "Import a workbook once and reuse it forever — preview, download or share it by link. The starter library gives you branded models to build from.",
        { route: "/admin/billing/templates", page: "Templates", icon: "fileStack" },
      ),
      {
        key: "litchai",
        route: "/admin/analyses",
        page: "Analyses",
        target: '[data-tour="analyses-studio"]',
        title: "Analyses",
        content:
          "Client documents compiled into formula-driven workbooks, grouped by client. Every number stays traceable, and anything the pipeline isn't confident about waits for a human — nothing unverified reaches a client.",
        icon: "bot",
        optional: true,
      },
      centerStep(
        "assistant",
        "Sage",
        "Ask questions in plain English across the firm's knowledge base — services, FAQs, internal SOPs — or scope it to one client and ask about their actual data.",
        { route: "/admin/sage", page: "Sage", icon: "sparkles" },
      ),
      centerStep(
        "settings",
        "Settings",
        "Your organisation profile — company details, logo, bank account, invoice terms and default currency. All of it flows straight onto what clients receive.",
        { route: "/admin/settings", page: "Settings", icon: "settings" },
      ),
      centerStep(
        "access",
        "Team and access",
        "Invite staff and admins, change roles, see who has two-step on and who is working on what. Every change is in the audit log.",
        { route: "/admin/settings/access", page: "Team and access", icon: "users" },
      ),
      centerStep(
        "integrations",
        "Integrations",
        "Email, storage, database, Google sign-in and Paystack, each reading its live config. Configured by environment, not by clicking — so nothing critical can be switched off by accident.",
        { route: "/admin/settings/integrations", page: "Integrations", icon: "cable" },
      ),
      centerStep(
        "help-desk",
        "Help Desk",
        "Every client ticket in one inbox — filter, search, reply, prioritise and assign. Your replies land in the client's Support Desk, same thread.",
        { route: "/admin/help-desk", page: "Help Desk", icon: "lifeBuoy" },
      ),
      centerStep(
        "audit",
        "Audit log",
        "Who did what, to what, and when — every destructive and important action, newest first. Filter by entity or action when you need to reconstruct a story.",
        { route: "/admin/audit", page: "Audit log", icon: "shieldCheck" },
      ),
      centerStep(
        "outro",
        "That's the platform",
        "Requests in, work out, money tracked, and LitchAI doing the heavy lifting on documents. The help button replays any page's tour whenever you want it.",
        { route: "/admin", page: "Dashboard", icon: "check" },
      ),
    ],
  },
};

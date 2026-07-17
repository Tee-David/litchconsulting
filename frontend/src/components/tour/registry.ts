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
export type TourAudience = "client" | "admin";
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
  // ─── Client · page tours ───────────────────────────────────────────────
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
        icon: "plus",
      },
      {
        key: "services",
        target: '[data-tour="services"]',
        title: "What do you need done?",
        content:
          "Your three most-requested services, with upfront pricing. Anything priced “Get A Quote” means we'll size it and send you a figure first — you're never charged before you accept.",
        icon: "briefcase",
        optional: true,
      },
      {
        key: "active-requests",
        target: '[data-tour="active-requests"]',
        title: "Live progress",
        content:
          "Each active request shows its milestones — payment, documents, work in progress, delivery — so you always know what's next and who's waiting on whom.",
        icon: "activity",
        optional: true,
      },
      {
        key: "client-kpis",
        target: '[data-tour="client-kpis"]',
        title: "Your numbers",
        content:
          "Active services, what you've paid, what's still outstanding, and open support tickets — the four figures worth knowing at a glance.",
        icon: "gauge",
        optional: true,
      },
      {
        key: "billing",
        target: '[data-tour="billing"]',
        title: "Recent billing",
        content:
          "Your latest invoices, quotes and receipts. Each row shows the amount and status — open one to pay online and everything updates instantly.",
        icon: "wallet",
        optional: true,
      },
      {
        key: "quick-actions",
        target: '[data-tour="quick-actions"]',
        title: "Quick actions",
        content:
          "Four shortcuts you'll reach for most: start a request, book a free consultation, open a support ticket, or grab a template.",
        icon: "pointer",
        optional: true,
      },
      {
        key: "tools",
        target: '[data-tour="tools"]',
        title: "Free tools",
        content:
          "Run PAYE, VAT, CIT and loan calculations yourself — the same NTA-2025 rates we apply in your engagements. Open them from the calculator icon in the top bar.",
        icon: "calculator",
        optional: true,
      },
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
          "Pick a service, tell us what you need and pay securely — most requests take under two minutes to submit.",
        icon: "plus",
        optional: true,
      },
      {
        key: "requests-list",
        target: '[data-tour="requests-list"]',
        title: "Your services",
        content:
          "Live engagements sit up top with their progress; completed and cancelled ones drop into the history below. Open any card to see documents, messages and deliverables.",
        icon: "briefcase",
        optional: true,
      },
    ],
  },

  "client-request-new": {
    id: "client-request-new",
    audience: "client",
    kind: "page",
    route: "/dashboard/requests/new",
    steps: [
      centerStep(
        "intro",
        "Requesting a service",
        "A short guided form: choose the service, tell us about the job, upload anything we'll need, then confirm. You can leave and come back — nothing is charged until you accept a price.",
        { icon: "compass" },
      ),
      {
        key: "service-picker",
        target: '[data-tour="service-picker"]',
        title: "Pick your service",
        content:
          "Each option shows its price or “Get A Quote”, the turnaround time, and the documents we'll ask for — so there are no surprises later.",
        icon: "briefcase",
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
      {
        key: "invoices-list",
        target: '[data-tour="invoices-list"]',
        title: "Billing & receipts",
        content:
          "Every invoice, quote and receipt is here. Open one to pay online — your dashboard and the request's progress update the moment payment clears.",
        icon: "wallet",
        optional: true,
      },
      {
        key: "payment-history",
        target: '[data-tour="payment-history"]',
        title: "Payment history",
        content:
          "Every payment attempt with its reference and channel. If you ever need help with a payment, quote the reference here and we'll find it immediately.",
        icon: "creditCard",
        optional: true,
      },
    ],
  },

  "client-templates": {
    id: "client-templates",
    audience: "client",
    kind: "page",
    route: "/dashboard/templates",
    steps: [
      {
        key: "templates-list",
        target: '[data-tour="templates-list"]',
        title: "Template library",
        content:
          "Branded finance templates — models, schedules and trackers — free to preview and download. Search by name, then open one to see what's inside before you take it.",
        icon: "fileStack",
        optional: true,
      },
    ],
  },

  "client-support": {
    id: "client-support",
    audience: "client",
    kind: "page",
    route: "/dashboard/support",
    steps: [
      {
        key: "support-kb",
        target: '[data-tour="support-kb"]',
        title: "Try a search first",
        content:
          "Search our help articles from here — most questions are already answered, and it's quicker than waiting on a reply.",
        icon: "search",
        optional: true,
      },
      {
        key: "support-contact",
        target: '[data-tour="support-contact"]',
        title: "Or ask us directly",
        content:
          "Open a ticket and a real person replies — here and by email. You can link it to a specific request so we have the context straight away.",
        icon: "plus",
        optional: true,
      },
      {
        key: "support-view",
        target: '[data-tour="support-view"]',
        title: "Your tickets",
        content:
          "Every conversation you've opened, with its status. Search them, and open one to read the full thread and reply.",
        icon: "lifeBuoy",
        optional: true,
      },
    ],
  },

  "client-settings": {
    id: "client-settings",
    audience: "client",
    kind: "page",
    route: "/dashboard/settings",
    steps: [
      centerStep(
        "profile",
        "Profile settings",
        "Your name, company, contact details and tax/RC number live here. We pull these straight onto your invoices and receipts, so keeping them current means your paperwork is always right.",
        { icon: "settings" },
      ),
    ],
  },

  // ─── Client · welcome + walkthrough ────────────────────────────────────
  "client-welcome": {
    id: "client-welcome",
    audience: "client",
    kind: "welcome",
    steps: [
      centerStep(
        "welcome",
        "Welcome to your portal",
        "This is your home base with Litch — request services, track progress, and handle billing in one place. Here's a quick look around.",
        { icon: "sparkles", showEstimate: true },
      ),
      navStep(
        "dashboard",
        "Dashboard",
        "Your at-a-glance home — active work, recent billing and quick actions.",
        { icon: "layout" },
      ),
      navStep(
        "my-services",
        "My Services",
        "Start a new request or follow every engagement from here.",
        { icon: "briefcase" },
      ),
      navStep(
        "billing",
        "Billing",
        "Invoices, quotes and receipts — pay online and it all updates instantly.",
        { icon: "wallet" },
      ),
      navStep(
        "templates",
        "Templates",
        "A free library of branded finance templates you can preview and download.",
        { icon: "fileStack" },
      ),
      navStep(
        "support",
        "Support Desk",
        "Questions? Open a ticket and a real person gets back to you quickly.",
        { icon: "lifeBuoy" },
      ),
      {
        key: "sidebar-pin",
        target: '[data-tour="sidebar-pin"]',
        title: "Give yourself more room",
        content:
          "This collapses the sidebar to a slim icon rail — handy on a laptop. It stays collapsed until you bring it back, and hovering the rail peeks it open.",
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
        content: "Tap here any time to jump between Dashboard, Services, Billing and Support.",
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
          "Tap the help button whenever you want a tour of the page you're on, or the full walk-through again.",
        placement: "bottom",
        icon: "replay",
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
        "We'll walk the whole portal together — a few seconds on each page. You can step out at any point.",
        { route: "/dashboard", page: "Dashboard", icon: "compass", showEstimate: true },
      ),
      {
        key: "dash-services",
        route: "/dashboard",
        page: "Dashboard",
        target: '[data-tour="services"]',
        title: "Start here",
        content:
          "Your most-requested services with upfront pricing. This is the fastest route from “I need this done” to a team working on it.",
        icon: "briefcase",
        optional: true,
      },
      {
        key: "dash-active",
        route: "/dashboard",
        page: "Dashboard",
        target: '[data-tour="active-requests"]',
        title: "Live progress",
        content:
          "Anything in flight shows its milestones here — payment, documents, work, delivery — so you always know what's next.",
        icon: "activity",
        optional: true,
      },
      {
        key: "go-services",
        route: "/dashboard",
        page: "Dashboard",
        target: '[data-tour="nav-my-services"]',
        title: "On to My Services",
        content: "This is where every engagement you've ever requested lives.",
        placement: "right",
        icon: "pointer",
        desktopOnly: true,
        interact: { hint: "Click “My Services” in the sidebar" },
      },
      {
        key: "services-list",
        route: "/dashboard/requests",
        page: "My Services",
        target: '[data-tour="requests-list"]',
        title: "My Services",
        content:
          "Live work up top, finished engagements in the history below. Open any one for its documents, messages and final deliverables.",
        icon: "briefcase",
        optional: true,
      },
      {
        key: "services-new",
        route: "/dashboard/requests",
        page: "My Services",
        target: '[data-tour="request-service"]',
        title: "Starting a request",
        content:
          "Pick a service, describe the job, upload what we ask for, and pay. Under two minutes, and nothing is charged before you accept a price.",
        icon: "plus",
        optional: true,
      },
      {
        key: "billing-list",
        route: "/dashboard/invoices",
        page: "Billing",
        target: '[data-tour="invoices-list"]',
        title: "Billing",
        content:
          "Every invoice, quote and receipt. Pay securely online and it reconciles against your request automatically — no “did that go through?” emails.",
        icon: "wallet",
        optional: true,
      },
      {
        key: "templates",
        route: "/dashboard/templates",
        page: "Templates",
        target: '[data-tour="templates-list"]',
        title: "Templates",
        content:
          "A free library of branded finance templates — models, schedules and trackers. Preview one, then download it and make it yours.",
        icon: "fileStack",
        optional: true,
      },
      {
        key: "support",
        route: "/dashboard/support",
        page: "Support Desk",
        target: '[data-tour="support-view"]',
        title: "Support Desk",
        content:
          "Open a ticket, link it to a request, and a real person replies. Every conversation stays here with its status.",
        icon: "lifeBuoy",
        optional: true,
      },
      centerStep(
        "settings",
        "Profile settings",
        "Keep your name, company and tax/RC number current — we pull them straight onto your invoices and receipts.",
        { route: "/dashboard/settings", page: "Profile", icon: "settings" },
      ),
      centerStep(
        "outro",
        "That's the portal",
        "You know your way around now. The help button in the top bar replays any of this whenever you want it — welcome aboard!",
        { route: "/dashboard", page: "Dashboard", icon: "check" },
      ),
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

  "admin-invoices": {
    id: "admin-invoices",
    audience: "admin",
    kind: "page",
    route: "/admin/finance/invoices",
    steps: [
      {
        key: "finance-tabs",
        target: '[data-tour="finance-tabs"]',
        title: "The finance workspace",
        content:
          "Six tabs: Invoices, Quotes, Receipts, Accounting, Models and Calculators. Everything about money lives behind these.",
        placement: "bottom",
        icon: "wallet",
        optional: true,
      },
      {
        key: "invoice-stats",
        target: '[data-tour="invoice-stats"]',
        title: "Where you stand",
        content: "Total invoiced, paid, outstanding and overdue — across every invoice, live.",
        icon: "gauge",
        optional: true,
      },
      {
        key: "invoices-table",
        target: '[data-tour="invoices-table"]',
        title: "The invoice list",
        content:
          "Filter by status or date range, search, and export to CSV. Row actions let you preview, edit, duplicate, send or mark paid — and selecting rows unlocks bulk status changes.",
        icon: "fileText",
        optional: true,
      },
      {
        key: "new-invoice",
        target: '[data-tour="new-invoice"]',
        title: "Building an invoice",
        content:
          "Add line items and watch the branded document build live beside you. Totals are always recomputed server-side, so the PDF and the pay page can never disagree with the preview.",
        icon: "plus",
        optional: true,
      },
    ],
  },

  "admin-quotes": {
    id: "admin-quotes",
    audience: "admin",
    kind: "page",
    route: "/admin/finance/quotes",
    steps: [
      {
        key: "quotes-table",
        target: '[data-tour="quotes-table"]',
        title: "Quotes",
        content:
          "Draft, send and track quotes. When a client accepts, convert the quote straight into an invoice — the line items and totals carry over untouched.",
        icon: "fileText",
        optional: true,
      },
      {
        key: "new-quote",
        target: '[data-tour="new-quote"]',
        title: "New quote",
        content:
          "Same builder as invoices, same branded document — it just goes out as a quote until it's accepted.",
        icon: "plus",
        optional: true,
      },
    ],
  },

  "admin-receipts": {
    id: "admin-receipts",
    audience: "admin",
    kind: "page",
    route: "/admin/finance/receipts",
    steps: [
      centerStep(
        "intro",
        "Receipts",
        "Every invoice you mark paid generates a branded receipt automatically — no separate step. Download any of them here as a PDF.",
        { icon: "receipt" },
      ),
    ],
  },

  "admin-accounting": {
    id: "admin-accounting",
    audience: "admin",
    kind: "page",
    route: "/admin/finance/accounting",
    steps: [
      centerStep(
        "intro",
        "Accounting",
        "A lightweight profit & loss. Revenue is drawn automatically from collected invoices — you only log the expenses, and they net off against it.",
        { icon: "calculator" },
      ),
      centerStep(
        "ledger",
        "What's here",
        "Revenue collected, expenses, net profit and margin up top; income vs expenses over six months and a category breakdown below; then the expense ledger itself, where you add and edit entries.",
        { icon: "barChart" },
      ),
    ],
  },

  "admin-models": {
    id: "admin-models",
    audience: "admin",
    kind: "page",
    route: "/admin/finance/tools",
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
    route: "/admin/finance/calculators",
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
    route: "/admin/finance/templates",
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
    steps: [
      centerStep(
        "welcome",
        "Welcome to the Litch admin",
        "This is where you run the firm — requests, clients, finance and LitchAI. Let's get you oriented on the navigation.",
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
      navStep("finance", "Finance", "Invoices, quotes, receipts, accounting and the calculators.", {
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
          "Invoiced, paid, outstanding, overdue. If overdue is climbing, your day starts in Finance instead.",
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
        route: "/admin/finance/invoices",
        page: "Finance",
        target: '[data-tour="invoices-table"]',
        title: "Finance — invoices",
        content:
          "Filter, search and export; row actions preview, edit, duplicate, send or mark paid. Select rows for bulk status changes.",
        icon: "wallet",
        optional: true,
      },
      {
        key: "finance-tabs",
        route: "/admin/finance/invoices",
        page: "Finance",
        target: '[data-tour="finance-tabs"]',
        title: "The rest of Finance",
        content:
          "Quotes convert to invoices on acceptance. Receipts generate themselves when you mark one paid. Accounting nets logged expenses against collected revenue, and the Calculators run NTA-2025 Nigerian tax maths.",
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
        { route: "/admin/finance/templates", page: "Templates", icon: "fileStack" },
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
        "Your organisation profile — company details, logo, bank account, invoice terms and default currency. All of it flows straight onto what clients receive. User access lives here too.",
        { route: "/admin/settings", page: "Settings", icon: "settings" },
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

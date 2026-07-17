/**
 * Route helpers for matching the current pathname to a page tour.
 *
 * `normalizeRoute` collapses dynamic detail segments so `/admin/requests/abc123`
 * matches the `/admin/requests/[id]` shape. `pageTourIdFor` maps a normalized
 * route to the id of the page tour that covers it (or null when none exists).
 */

/**
 * Detail-route shapes. Every pattern excludes the literal sub-routes that share
 * its depth (`new`, `editor`, …) — those are real pages with their own tours,
 * and folding them into the `[id]` shape would make their tour unreachable.
 */
const DYNAMIC_PATTERNS: Array<[RegExp, string]> = [
  [/^\/admin\/requests\/[^/]+$/, "/admin/requests/[id]"],
  [/^\/admin\/clients\/[^/]+$/, "/admin/clients/[id]"],
  [/^\/admin\/blog\/(?!new$)[^/]+\/edit$/, "/admin/blog/[id]/edit"],
  [/^\/admin\/finance\/invoices\/(?!new$)[^/]+$/, "/admin/finance/invoices/[id]"],
  [/^\/admin\/finance\/quotes\/(?!new$)[^/]+$/, "/admin/finance/quotes/[id]"],
  [/^\/admin\/analyses\/(?!editor$|observability$)[^/]+$/, "/admin/analyses/[documentId]"],
  [/^\/dashboard\/requests\/(?!new$)[^/]+$/, "/dashboard/requests/[id]"],
  [/^\/dashboard\/invoices\/[^/]+$/, "/dashboard/invoices/[id]"],
  [/^\/dashboard\/support\/[^/]+$/, "/dashboard/support/[id]"],
];

export function normalizeRoute(pathname: string): string {
  // Drop query/hash defensively, then trailing slashes.
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  for (const [pattern, replacement] of DYNAMIC_PATTERNS) {
    if (pattern.test(clean)) return replacement;
  }
  return clean;
}

/**
 * Normalized route → page tour id. Detail routes (`[id]`) intentionally have no
 * tour: they're driven by the record in front of you, not by a fixed layout.
 */
const ROUTE_TO_TOUR: Record<string, string> = {
  // Client portal
  "/dashboard": "client-dashboard",
  "/dashboard/requests": "client-requests",
  "/dashboard/requests/new": "client-request-new",
  "/dashboard/invoices": "client-invoices",
  "/dashboard/support": "client-support",
  "/dashboard/settings": "client-settings",

  // Admin
  "/admin": "admin-dashboard",
  "/admin/requests": "admin-requests",
  "/admin/clients": "admin-clients",
  "/admin/reports": "admin-reports",
  "/admin/finance/invoices": "admin-invoices",
  "/admin/finance/quotes": "admin-quotes",
  "/admin/finance/receipts": "admin-receipts",
  "/admin/finance/accounting": "admin-accounting",
  "/admin/finance/tools": "admin-models",
  "/admin/finance/calculators": "admin-calculators",
  "/admin/blog": "admin-blog",
  "/admin/finance/templates": "admin-templates",
  "/admin/analyses": "admin-litchai",
  "/admin/analyses/observability": "admin-litchai-observability",
  "/admin/sage": "admin-assistant",
  "/admin/settings": "admin-settings",
  "/admin/settings/integrations": "admin-integrations",
  "/admin/help-desk": "admin-help-desk",
  "/admin/audit": "admin-audit",
  "/admin/services": "admin-services",
  "/admin/trash": "admin-trash",
  "/admin/notifications": "admin-notifications",
};

export function pageTourIdFor(pathname: string): string | null {
  return ROUTE_TO_TOUR[normalizeRoute(pathname)] ?? null;
}

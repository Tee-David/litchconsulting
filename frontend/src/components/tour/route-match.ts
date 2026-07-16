/**
 * Route helpers for matching the current pathname to a page tour.
 *
 * `normalizeRoute` collapses dynamic detail segments so `/admin/requests/abc123`
 * matches the `/admin/requests/[id]` shape. `pageTourIdFor` maps a normalized
 * route to the id of the page tour that covers it (or null when none exists).
 */

const DYNAMIC_PATTERNS: Array<[RegExp, string]> = [
  [/^\/admin\/requests\/[^/]+$/, "/admin/requests/[id]"],
  [/^\/admin\/clients\/[^/]+$/, "/admin/clients/[id]"],
  [/^\/dashboard\/requests\/[^/]+$/, "/dashboard/requests/[id]"],
];

export function normalizeRoute(pathname: string): string {
  // Drop query/hash defensively, then trailing slashes.
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  for (const [pattern, replacement] of DYNAMIC_PATTERNS) {
    if (pattern.test(clean)) return replacement;
  }
  return clean;
}

/** Normalized route → page tour id. Detail routes intentionally have no tour. */
const ROUTE_TO_TOUR: Record<string, string> = {
  "/dashboard": "client-dashboard",
  "/dashboard/requests": "client-requests",
  "/dashboard/invoices": "client-invoices",
  "/dashboard/support": "client-support",
  "/admin": "admin-dashboard",
  "/admin/requests": "admin-requests",
  "/admin/clients": "admin-clients",
};

export function pageTourIdFor(pathname: string): string | null {
  return ROUTE_TO_TOUR[normalizeRoute(pathname)] ?? null;
}

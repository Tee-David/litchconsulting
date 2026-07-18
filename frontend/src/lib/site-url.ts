/**
 * The public origin of the app, for links built outside a request scope (server
 * pages, crons, emails). Mirrors the fallback order used by the payment and
 * email helpers so every generated link points at the same host.
 */
export function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.BETTER_AUTH_URL ||
    "https://www.litchconsulting.com"
  ).replace(/\/$/, "");
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Unsplash URLs are already sized via query params; serve them directly so
    // the optimizer can't fail on certain device sizes (fixes broken images on mobile).
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // @sparticuz/chromium ships a compressed Chromium the HTML→PDF renderer loads
  // at runtime; keep it (and puppeteer-core) external so Next doesn't bundle or
  // mangle the binary.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Templates and Integrations moved under Finance / Settings; the AI surfaces
  // were renamed (assistant → sage, litchai → analyses). Keep the old URLs
  // working for bookmarks and anything already linking to them.
  async redirects() {
    return [
      { source: "/admin/templates", destination: "/admin/finance/templates", permanent: true },
      { source: "/admin/templates/:path*", destination: "/admin/finance/templates/:path*", permanent: true },
      { source: "/admin/integrations", destination: "/admin/settings/integrations", permanent: true },
      { source: "/admin/integrations/:path*", destination: "/admin/settings/integrations/:path*", permanent: true },
      { source: "/admin/assistant", destination: "/admin/sage", permanent: true },
      { source: "/admin/assistant/:path*", destination: "/admin/sage/:path*", permanent: true },
      { source: "/admin/litchai", destination: "/admin/analyses", permanent: true },
      { source: "/admin/litchai/:path*", destination: "/admin/analyses/:path*", permanent: true },
    ];
  },
  outputFileTracingIncludes: {
    // Ship the invoice fonts (Noto Sans, for the ₦ glyph) and the signature
    // scan with every function that renders a PDF or emails a receipt — the
    // HTML→PDF path embeds both as data URIs read from disk at runtime.
    // @sparticuz/chromium extracts bin/*.br at runtime via a computed path, so
    // nothing imports them and the tracer can't see them. Without this they are
    // absent from the function, Chromium can't launch, and the PDF silently
    // degrades to the @react-pdf fallback.
    "/api/admin/**": [
      "./src/lib/invoice/pdf/fonts/**",
      "./public/brand/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/dashboard/**": [
      "./src/lib/invoice/pdf/fonts/**",
      "./public/brand/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/paystack/**": [
      "./src/lib/invoice/pdf/fonts/**",
      "./public/brand/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/admin/finance/**": [
      "./src/lib/invoice/pdf/fonts/**",
      "./public/brand/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    // The payment-return page renders the receipt PDF (applySuccessfulPayment →
    // renderInvoicePdf). It lives outside the globs above, so without this the
    // Chromium binary is absent here and every paid receipt degraded to the
    // @react-pdf fallback (the grey-circle watermark). Trace the browser in.
    "/pay/**": [
      "./src/lib/invoice/pdf/fonts/**",
      "./public/brand/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    // Pin the CockroachDB CA cert into every function so the DB layer always
    // validates against the committed cert, not just system CAs.
    "/**": ["./certs/cockroach-ca.crt"],
  },
};

export default nextConfig;

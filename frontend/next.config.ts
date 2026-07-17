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
  outputFileTracingIncludes: {
    // Ship the invoice fonts (Noto Sans, for the ₦ glyph) and the signature
    // scan with every function that renders a PDF or emails a receipt — the
    // HTML→PDF path embeds both as data URIs read from disk at runtime.
    "/api/admin/**": ["./src/lib/invoice/pdf/fonts/**", "./public/brand/**"],
    "/api/dashboard/**": ["./src/lib/invoice/pdf/fonts/**", "./public/brand/**"],
    "/api/paystack/**": ["./src/lib/invoice/pdf/fonts/**", "./public/brand/**"],
    "/admin/finance/**": ["./src/lib/invoice/pdf/fonts/**", "./public/brand/**"],
    // Pin the CockroachDB CA cert into every function so the DB layer always
    // validates against the committed cert, not just system CAs.
    "/**": ["./certs/cockroach-ca.crt"],
  },
};

export default nextConfig;

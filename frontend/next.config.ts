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
  outputFileTracingIncludes: {
    // Ship the invoice PDF fonts (Noto Sans, for the ₦ glyph) with the
    // serverless functions that render PDFs, so they resolve at runtime.
    "/api/admin/**": ["./src/lib/invoice/pdf/fonts/**"],
    "/admin/finance/**": ["./src/lib/invoice/pdf/fonts/**"],
    // Pin the CockroachDB CA cert into every function so the DB layer always
    // validates against the committed cert, not just system CAs.
    "/**": ["./certs/cockroach-ca.crt"],
  },
};

export default nextConfig;

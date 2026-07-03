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
  // Ship the invoice PDF fonts (Noto Sans, for the ₦ glyph) with the serverless
  // functions that render PDFs, so they resolve at runtime on Vercel.
  outputFileTracingIncludes: {
    "/api/admin/invoices/**": ["./src/lib/invoice/pdf/fonts/**"],
    "/api/admin/receipts/**": ["./src/lib/invoice/pdf/fonts/**"],
    "/admin/finance/**": ["./src/lib/invoice/pdf/fonts/**"],
  },
};

export default nextConfig;

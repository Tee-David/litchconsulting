import type { MetadataRoute } from "next";

const base = "https://www.litchconsulting.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep private / non-content areas out of the index.
      disallow: [
        "/admin",
        "/dashboard",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/i/",
        "/api/",
        "/offline",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

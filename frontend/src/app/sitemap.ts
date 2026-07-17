import type { MetadataRoute } from "next";
import { services, caseStudyDetails, legal } from "@/lib/content";
import { getAllInsights } from "@/lib/insights";

const base = "https://www.litchconsulting.com";

/**
 * The CMS half of the sitemap is a DB read, and this route is generated at
 * build time alongside 40-odd static pages — all competing for CockroachDB's
 * serverless connection cap. A slow read here used to hang past Next's 60s
 * export limit and fail the whole build (an unreachable DB did the same).
 *
 * The static routes are the ones that matter most for SEO and need no DB, so
 * a stalled CMS degrades the sitemap instead of breaking the deploy. Note a
 * plain try/catch is not enough: the failure mode is a hang, not a throw.
 */
const CMS_TIMEOUT_MS = 15_000;

async function insightsOrNone() {
  try {
    return await Promise.race([
      getAllInsights(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`insights read exceeded ${CMS_TIMEOUT_MS}ms`)), CMS_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    console.error("[sitemap] insight routes omitted —", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const insightPosts = await insightsOrNone();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/services`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.7 },
    { url: `${base}/case-studies`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/insights`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/book`, lastModified: now, changeFrequency: "yearly", priority: 0.6 },
  ];

  const serviceRoutes: MetadataRoute.Sitemap = services.map((s) => ({
    url: `${base}/services/${s.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const caseStudyRoutes: MetadataRoute.Sitemap = caseStudyDetails.map((d) => ({
    url: `${base}/case-studies/${d.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const insightRoutes: MetadataRoute.Sitemap = insightPosts.map((p) => ({
    url: `${base}/insights/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const legalRoutes: MetadataRoute.Sitemap = legal.map((l) => ({
    url: `${base}/legal/${l.slug}`,
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  return [...staticRoutes, ...serviceRoutes, ...caseStudyRoutes, ...insightRoutes, ...legalRoutes];
}

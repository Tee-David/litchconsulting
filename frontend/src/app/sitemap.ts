import type { MetadataRoute } from "next";
import { services, caseStudyDetails, legal } from "@/lib/content";
import { db } from "@/lib/db/client";
import { serviceOffering } from "@/lib/db/schema";
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

/**
 * When the marketing copy in lib/content.ts last changed. Bump it with copy
 * edits: a sitemap that says "changed today" on every build teaches search
 * engines to ignore lastModified.
 */
const CONTENT_UPDATED = new Date("2026-11-05");

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} exceeded ${CMS_TIMEOUT_MS}ms`)), CMS_TIMEOUT_MS)),
  ]);
}

/** Per-service last change: the later of the copy and the admin-edited offering (price, turnaround). */
async function serviceDates(): Promise<Map<string, Date>> {
  try {
    const rows = await withTimeout(db.select({ slug: serviceOffering.slug, updatedAt: serviceOffering.updatedAt }).from(serviceOffering), "service dates");
    return new Map(rows.map((r) => [r.slug, r.updatedAt > CONTENT_UPDATED ? r.updatedAt : CONTENT_UPDATED]));
  } catch (err) {
    console.error("[sitemap] service dates omitted —", err instanceof Error ? err.message : err);
    return new Map();
  }
}

async function insightsOrNone() {
  try {
    return await withTimeout(getAllInsights(), "insights read");
  } catch (err) {
    console.error("[sitemap] insight routes omitted —", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = CONTENT_UPDATED;
  const [insightPosts, svcDates] = await Promise.all([insightsOrNone(), serviceDates()]);
  const latestPost = insightPosts.reduce((m, p) => (p.date > m ? p.date : m), "");

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/services`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.7 },
    { url: `${base}/case-studies`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/insights`, lastModified: latestPost ? new Date(latestPost) : now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/get-started`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/calculators`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/book`, lastModified: now, changeFrequency: "yearly", priority: 0.6 },
  ];

  const serviceRoutes: MetadataRoute.Sitemap = services.map((s) => ({
    url: `${base}/services/${s.slug}`,
    lastModified: svcDates.get(s.slug) ?? now,
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
    lastModified: new Date(l.updated),
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  const requestRoutes: MetadataRoute.Sitemap = services.map((s) => ({
    url: `${base}/request/${s.slug}`,
    lastModified: svcDates.get(s.slug) ?? now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...serviceRoutes, ...requestRoutes, ...caseStudyRoutes, ...insightRoutes, ...legalRoutes];
}

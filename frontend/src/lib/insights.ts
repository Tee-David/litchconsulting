import "server-only";
import { insights as staticInsights } from "@/lib/content";
import { listPublishedPosts } from "@/lib/db/queries/posts";
import { splitBody, estimateReadMins } from "@/lib/insights-format";

export { splitBody, estimateReadMins };

/** Unified public shape for an Insights article (static or CMS-managed). */
export type InsightPost = {
  slug: string;
  tag: string;
  title: string;
  excerpt: string;
  image: string;
  date: string; // YYYY-MM-DD
  author: string;
  readMins: number;
  body: string[]; // paragraphs / lightweight-markdown lines
  seoTitle?: string;
  seoDescription?: string;
  source: "cms" | "curated";
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80";

function iso(d: Date | null): string {
  return (d ?? new Date()).toISOString().slice(0, 10);
}

/** All published CMS posts merged over the curated static posts (CMS wins). */
export async function getAllInsights(): Promise<InsightPost[]> {
  const dbPosts = await listPublishedPosts();
  const cms: InsightPost[] = dbPosts.map((p) => ({
    slug: p.slug,
    tag: p.tag || "Insights",
    title: p.title,
    excerpt: p.excerpt || "",
    image: p.coverImage || FALLBACK_IMAGE,
    date: iso(p.publishedAt ?? p.createdAt),
    author: p.author || "Litch Consulting",
    readMins: p.readMins || estimateReadMins(p.body),
    body: splitBody(p.body),
    seoTitle: p.seoTitle || undefined,
    seoDescription: p.seoDescription || undefined,
    source: "cms",
  }));

  const seen = new Set(cms.map((p) => p.slug));
  const curated: InsightPost[] = staticInsights.posts
    .filter((p) => !seen.has(p.slug))
    .map((p) => ({
      slug: p.slug,
      tag: p.tag,
      title: p.title,
      excerpt: p.excerpt,
      image: p.image,
      date: p.date,
      author: p.author,
      readMins: p.readMins,
      body: p.body,
      source: "curated",
    }));

  return [...cms, ...curated].sort((a, b) => b.date.localeCompare(a.date));
}

export async function getInsight(slug: string): Promise<InsightPost | null> {
  const all = await getAllInsights();
  return all.find((p) => p.slug === slug) ?? null;
}

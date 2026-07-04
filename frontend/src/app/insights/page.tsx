import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section, SectionHeading } from "@/components/ui/primitives";
import { PageHero } from "@/components/ui/page-hero";
import { Contact } from "@/components/sections/contact";
import { insights } from "@/lib/content";
import { getAllInsights } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Insights",
  description: "Articles on finance, tax updates and business advisory from the team at Litch Consulting.",
};

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function InsightsPage() {
  const posts = await getAllInsights();
  const [featured, ...rest] = posts;

  return (
    <>
      <Header overlay />
      <main className="flex-1">
        <PageHero
          eyebrow={insights.eyebrow}
          title="Finance, tax and advisory; clearly explained."
          subtitle="Practical thinking on the numbers that shape your business."
          breadcrumb="Home — Insights"
          image={featured.image}
        />

        <Section>
          {/* Featured */}
          <Link
            href={`/insights/${featured.slug}`}
            className="group grid overflow-hidden rounded-hero border border-hairline bg-paper shadow-sm shadow-black/5 transition-all duration-300 hover:shadow-xl hover:shadow-brand/5 lg:grid-cols-2"
          >
            <div className="relative min-h-[240px] lg:min-h-[380px]">
              <Image
                src={featured.image}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="flex flex-col justify-center gap-4 p-8 md:p-12">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                {featured.tag} · Editor&rsquo;s pick
              </span>
              <h2 className="font-display text-2xl font-bold leading-tight tracking-tight text-ink text-balance md:text-3xl">
                {featured.title}
              </h2>
              <p className="text-body">{featured.excerpt}</p>
              <p className="text-sm text-muted">
                {fmtDate(featured.date)} · {featured.readMins} min read
              </p>
            </div>
          </Link>

          {/* Grid */}
          <SectionHeading className="mt-16" eyebrow="All articles" title="Latest insights." />
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <Link
                key={post.slug}
                href={`/insights/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-card border border-hairline bg-paper shadow-sm shadow-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/5"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={post.image}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                    {post.tag}
                  </span>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <h3 className="font-display text-base font-bold leading-snug text-ink">{post.title}</h3>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                      <ArrowUpRight className="size-4" />
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-body">{post.excerpt}</p>
                  <p className="mt-4 text-xs text-muted">
                    {fmtDate(post.date)} · {post.readMins} min read
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Section>

        <Contact />
      </main>
      <Footer />
    </>
  );
}

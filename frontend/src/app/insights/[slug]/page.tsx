import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section, SectionHeading } from "@/components/ui/primitives";
import { PageHero } from "@/components/ui/page-hero";
import { Contact } from "@/components/sections/contact";
import { insights } from "@/lib/content";

export function generateStaticParams() {
  return insights.posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = insights.posts.find((p) => p.slug === slug);
  if (!post) return { title: "Article not found" };
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [post.image],
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function InsightPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = insights.posts.find((p) => p.slug === slug);
  if (!post) notFound();
  const related = insights.posts.filter((p) => p.slug !== slug).slice(0, 3);

  return (
    <>
      <Header overlay />
      <main className="flex-1">
        <PageHero
          eyebrow={post.tag}
          title={post.title}
          breadcrumb={`Home — Insights — ${post.tag}`}
          image={post.image}
        />

        <Section>
          <article className="mx-auto max-w-2xl">
            <div className="flex items-center gap-3 border-b border-hairline pb-6 text-sm text-muted">
              <span className="font-semibold text-ink">{post.author}</span>
              <span>·</span>
              <span>{fmtDate(post.date)}</span>
              <span>·</span>
              <span>{post.readMins} min read</span>
            </div>

            <p className="mt-8 text-xl leading-relaxed text-ink text-pretty">{post.excerpt}</p>

            <div className="mt-6 space-y-6">
              {post.body.map((para, i) => (
                <p key={i} className="text-base leading-relaxed text-body">
                  {para}
                </p>
              ))}
            </div>

            <div className="mt-10 rounded-card border border-hairline bg-surface p-6 text-center">
              <p className="font-display text-lg font-bold text-ink">Want this applied to your numbers?</p>
              <p className="mt-2 text-sm text-body">
                Book a free consultation and let&rsquo;s turn insight into action.
              </p>
              <Link
                href="/book"
                className="mt-4 inline-flex rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Book a consultation
              </Link>
            </div>
          </article>
        </Section>

        {/* Related */}
        <Section className="bg-surface">
          <SectionHeading eyebrow="Keep reading" title="More insights." />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {related.map((p) => (
              <Link
                key={p.slug}
                href={`/insights/${p.slug}`}
                className="group flex flex-col overflow-hidden rounded-card border border-hairline bg-paper shadow-sm shadow-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/5"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={p.image}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{p.tag}</span>
                  <h3 className="mt-2 font-display text-base font-bold leading-snug text-ink">{p.title}</h3>
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

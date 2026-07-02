import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Section, SectionHeading, Reveal, Button } from "@/components/ui/primitives";
import { insights } from "@/lib/content";

export function Insights() {
  return (
    <Section id="insights">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <SectionHeading eyebrow={insights.eyebrow} title={insights.title} />
        <Button href="/insights" variant="outline" withArrow className="self-start">
          View all insights
        </Button>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {insights.posts.slice(0, 3).map((post, i) => (
          <Reveal key={post.slug} delay={i * 0.08}>
            <Link
              href={`/insights/${post.slug}`}
              className="group flex h-full flex-col overflow-hidden rounded-card border border-hairline bg-paper transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/5"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={post.image}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="keep-brand absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-brand backdrop-blur-md">
                  {post.tag}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="font-display text-lg font-bold leading-snug text-ink">{post.title}</h3>
                <p className="mt-2 flex-1 text-sm text-body">{post.excerpt}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                  Read article{" "}
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

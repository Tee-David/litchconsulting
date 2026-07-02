import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section, SectionHeading, Eyebrow } from "@/components/ui/primitives";
import { PageHero } from "@/components/ui/page-hero";
import { Contact } from "@/components/sections/contact";
import { caseStudies, caseStudyDetails } from "@/lib/content";

export function generateStaticParams() {
  return caseStudyDetails.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const i = caseStudyDetails.findIndex((d) => d.slug === slug);
  if (i < 0) return { title: "Case study not found" };
  const study = caseStudies[i];
  return {
    title: study.title,
    description: study.body,
    openGraph: { title: study.title, description: study.body, images: [study.image] },
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const i = caseStudyDetails.findIndex((d) => d.slug === slug);
  if (i < 0) notFound();
  const study = caseStudies[i];
  const detail = caseStudyDetails[i];

  return (
    <>
      <Header overlay />
      <main className="flex-1">
        <PageHero
          eyebrow={study.tag}
          title={study.title}
          subtitle={study.body}
          breadcrumb="Home — Case Studies"
          image={study.image}
        />

        <Section>
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-10">
              <div>
                <Eyebrow>The challenge</Eyebrow>
                <p className="mt-4 text-lg leading-relaxed text-body">{detail.challenge}</p>
              </div>
              <div>
                <Eyebrow>Our approach</Eyebrow>
                <p className="mt-4 text-lg leading-relaxed text-body">{detail.approach}</p>
              </div>
              <div>
                <Eyebrow>The results</Eyebrow>
                <ul className="mt-4 space-y-3">
                  {detail.results.map((r) => (
                    <li key={r} className="flex items-start gap-3">
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                        <Check className="size-3.5" />
                      </span>
                      <span className="text-body">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Headline stat */}
            <aside>
              <div className="rounded-hero bg-night p-8 text-white md:p-10">
                <p className="font-display text-5xl font-bold text-white">{study.stat}</p>
                <p className="mt-2 text-sm uppercase tracking-widest text-white/60">{study.statLabel}</p>
                <div className="mt-8 border-t border-white/10 pt-6">
                  <p className="text-sm text-white/70">
                    Want an outcome like this? Let&rsquo;s talk about your numbers.
                  </p>
                  <Link
                    href="/book"
                    className="keep-brand mt-4 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand transition-colors hover:bg-white/90"
                  >
                    Book a consultation
                  </Link>
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-14">
            <SectionHeading eyebrow="More case studies" title="Explore other engagements." />
            <div className="mt-8 flex flex-wrap gap-3">
              {caseStudyDetails
                .filter((d) => d.slug !== slug)
                .slice(0, 6)
                .map((d) => {
                  const orig = caseStudies[caseStudyDetails.findIndex((x) => x.slug === d.slug)];
                  return (
                    <Link
                      key={d.slug}
                      href={`/case-studies/${d.slug}`}
                      className="rounded-full border border-hairline bg-paper px-4 py-2 text-sm font-medium text-body transition-colors hover:border-brand hover:text-brand"
                    >
                      {orig.title}
                    </Link>
                  );
                })}
            </div>
          </div>
        </Section>

        <Contact />
      </main>
      <Footer />
    </>
  );
}

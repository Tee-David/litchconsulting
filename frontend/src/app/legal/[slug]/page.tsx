import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section } from "@/components/ui/primitives";
import { PageHero } from "@/components/ui/page-hero";
import { LegalToc } from "@/components/legal-toc";
import { legal, legalImage } from "@/lib/content";

export function generateStaticParams() {
  return legal.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = legal.find((d) => d.slug === slug);
  if (!doc) return { title: "Not found" };
  return { title: doc.title, description: doc.intro };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = legal.find((d) => d.slug === slug);
  if (!doc) notFound();

  return (
    <>
      <Header overlay />
      <main className="flex-1">
        <PageHero
          eyebrow="Legal"
          title={doc.title}
          subtitle={`Last updated ${doc.updated}`}
          breadcrumb={`Home — Legal — ${doc.title}`}
          image={legalImage}
        />

        <Section>
          <div className="grid gap-12 lg:grid-cols-[0.9fr_2fr]">
            {/* Contents (sticky, scroll-spy) */}
            <LegalToc
              sections={doc.sections.map((s, i) => ({ id: `s${i}`, heading: s.heading }))}
              others={legal.filter((d) => d.slug !== slug).map((d) => ({ slug: d.slug, title: d.title }))}
            />

            {/* Body */}
            <article className="max-w-2xl">
              <p className="text-lg leading-relaxed text-body">{doc.intro}</p>
              <div className="mt-10 space-y-10">
                {doc.sections.map((s, i) => (
                  <section key={s.heading} id={`s${i}`} className="scroll-mt-28">
                    <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                      {s.heading}
                    </h2>
                    <div className="mt-3 space-y-4">
                      {s.body.map((p, j) => (
                        <p key={j} className="leading-relaxed text-body">
                          {p}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}

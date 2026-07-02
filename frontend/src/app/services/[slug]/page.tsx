import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section, SectionHeading, Button } from "@/components/ui/primitives";
import { PageHero } from "@/components/ui/page-hero";
import { Contact } from "@/components/sections/contact";
import { services } from "@/lib/content";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = services.find((s) => s.slug === slug);
  if (!service) return { title: "Service not found" };
  return {
    title: service.name,
    description: service.overview,
    openGraph: { title: service.name, description: service.overview, images: [service.image] },
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = services.find((s) => s.slug === slug);
  if (!service) notFound();

  return (
    <>
      <Header overlay />
      <main className="flex-1">
        <PageHero
          eyebrow={service.kind}
          title={service.name}
          subtitle={service.tagline}
          breadcrumb={`Home — Services — ${service.name}`}
          image={service.image}
        />

        {/* Overview + use cases */}
        <Section>
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <SectionHeading eyebrow="Overview" title="How we help." />
              <p className="mt-6 text-lg leading-relaxed text-body">{service.overview}</p>
              <div className="mt-8">
                <Button href="/book" withArrow>
                  Book a consultation
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {service.useCases.map((uc) => (
                <div
                  key={uc.title}
                  className="rounded-card border border-hairline bg-paper p-6 shadow-sm shadow-black/5"
                >
                  <h3 className="font-display text-base font-bold text-ink">{uc.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-body">{uc.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Deliverables + FAQs */}
        <Section className="bg-surface">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <SectionHeading eyebrow="What you get" title="Deliverables." />
              <ul className="mt-8 space-y-3">
                {service.deliverables.map((d) => (
                  <li key={d} className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                      <Check className="size-3.5" />
                    </span>
                    <span className="text-body">{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <SectionHeading eyebrow="FAQs" title="Good to know." />
              <div className="mt-8 space-y-4">
                {service.faqs.map((f) => (
                  <div key={f.q} className="rounded-card border border-hairline bg-paper p-6">
                    <h3 className="font-display text-base font-bold text-ink">{f.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-body">{f.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap gap-3">
            {services
              .filter((s) => s.slug !== service.slug)
              .slice(0, 5)
              .map((s) => (
                <Link
                  key={s.slug}
                  href={`/services/${s.slug}`}
                  className="rounded-full border border-hairline bg-paper px-4 py-2 text-sm font-medium text-body transition-colors hover:border-brand hover:text-brand"
                >
                  {s.name}
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

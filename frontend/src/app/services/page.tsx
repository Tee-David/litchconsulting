import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section, SectionHeading } from "@/components/ui/primitives";
import { PageHero } from "@/components/ui/page-hero";
import { Stats } from "@/components/sections/stats";
import { Contact } from "@/components/sections/contact";
import { services } from "@/lib/content";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Financial reporting, modelling, taxation, forensic accounting, data analytics and advisory; one firm for the full financial picture.",
};

export default function ServicesPage() {
  return (
    <>
      <Header overlay />
      <main className="flex-1">
        <PageHero
          eyebrow="Our services"
          title="One firm for the full financial picture."
          subtitle="Clear, practical financial solutions with real business use cases; delivered under one roof."
          breadcrumb="Home — Services"
          image={services[0].image}
        />

        <Section>
          <SectionHeading
            eyebrow="What we do"
            title="Solutions that turn numbers into confident decisions."
            body="Every engagement is tailored to your goals; here's how we help across the financial picture."
            align="center"
          />

          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => {
              const featured = i === 1;
              return (
                <Link
                  key={s.slug}
                  href={`/services/${s.slug}`}
                  className={`group flex flex-col overflow-hidden rounded-card border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                    featured
                      ? "border-transparent bg-night text-white hover:shadow-brand/20"
                      : "border-hairline bg-paper shadow-sm shadow-black/5 hover:shadow-brand/5"
                  }`}
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      src={s.image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <span
                      className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                        featured ? "text-highlight" : "text-brand"
                      }`}
                    >
                      {s.kind}
                    </span>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <h3 className={`font-display text-lg font-bold ${featured ? "text-white" : "text-ink"}`}>
                        {s.name}
                      </h3>
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors ${
                          featured
                            ? "bg-white/15 text-white group-hover:bg-white group-hover:text-brand"
                            : "bg-brand-tint text-brand group-hover:bg-brand group-hover:text-white"
                        }`}
                      >
                        <ArrowUpRight className="size-4" />
                      </span>
                    </div>
                    <p className={`mt-2 text-sm leading-relaxed ${featured ? "text-white/75" : "text-body"}`}>
                      {s.tagline}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Section>

        <Stats />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

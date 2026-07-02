import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section, SectionHeading } from "@/components/ui/primitives";
import { PageHero } from "@/components/ui/page-hero";
import { Contact } from "@/components/sections/contact";
import { caseStudies, caseStudyDetails } from "@/lib/content";

export const metadata: Metadata = {
  title: "Case Studies",
  description: "Real engagements and measurable outcomes across reporting, modelling, tax, forensic accounting and analytics.",
};

export default function CaseStudiesPage() {
  return (
    <>
      <Header overlay />
      <main className="flex-1">
        <PageHero
          eyebrow="Case studies"
          title="Real engagements, measurable outcomes."
          subtitle="A look at how Litch turns financial challenges into clear, quantifiable results."
          breadcrumb="Home — Case Studies"
          image={caseStudies[0].image}
        />

        <Section>
          <SectionHeading
            eyebrow="Selected work"
            title="Outcomes our clients can point to."
            align="center"
          />
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {caseStudies.map((study, i) => (
              <Link
                key={study.title}
                href={`/case-studies/${caseStudyDetails[i].slug}`}
                className="group flex flex-col overflow-hidden rounded-card border border-hairline bg-paper shadow-sm shadow-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/5"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={study.image}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute bottom-3 left-3 rounded-xl bg-night/85 px-3 py-2 backdrop-blur-md">
                    <p className="font-display text-lg font-bold text-white">{study.stat}</p>
                    <p className="text-[10px] uppercase tracking-widest text-white/60">{study.statLabel}</p>
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-base font-bold leading-snug text-ink">{study.title}</h3>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                      <ArrowUpRight className="size-4" />
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-body">{study.body}</p>
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

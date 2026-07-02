import type { Metadata } from "next";
import Image from "next/image";
import { Section, SectionHeading } from "@/components/ui/primitives";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PageHero } from "@/components/ui/page-hero";
import { Stats } from "@/components/sections/stats";
import { Contact } from "@/components/sections/contact";
import { about } from "@/lib/content";

export const metadata: Metadata = {
  title: "About",
  description: about.intro,
};

export default function AboutPage() {
  return (
    <>
      <Header overlay />
      <main className="flex-1">
        <PageHero
          eyebrow={about.eyebrow}
          title={about.title}
          subtitle="A professional finance firm built to turn numbers into confident decisions."
          breadcrumb="Home — About"
          image={about.team[0].image}
        />

        {/* Intro + mission */}
        <Section>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading eyebrow="Who we are" title="Finance expertise with a human touch." />
              <p className="mt-6 text-lg leading-relaxed text-body">{about.intro}</p>
            </div>
            <div className="rounded-hero bg-night p-8 text-white md:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-highlight">
                Our mission
              </p>
              <p className="mt-4 font-display text-2xl font-bold leading-snug text-balance md:text-3xl">
                {about.mission}
              </p>
              <ul className="mt-8 grid gap-2 sm:grid-cols-2">
                {about.credentials.map((c) => (
                  <li key={c} className="text-sm text-white/80">
                    · {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* Values */}
        <Section className="bg-surface">
          <SectionHeading
            eyebrow="What we stand for"
            title="The principles behind every engagement."
            align="center"
          />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {about.values.map((v) => (
              <div key={v.title} className="rounded-card border border-hairline bg-paper p-6">
                <h3 className="font-display text-base font-bold text-ink">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-body">{v.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Team */}
        <Section>
          <SectionHeading
            eyebrow="Our team"
            title="The people behind your numbers."
            body="Chartered accountants, tax specialists and analysts who bring rigour and clarity to every engagement."
          />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {about.team.map((m) => (
              <article
                key={m.name}
                className="group overflow-hidden rounded-card border border-hairline bg-paper shadow-sm shadow-black/5"
              >
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={m.image}
                    alt={m.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-5">
                  <h3 className="font-display text-base font-bold text-ink">{m.name}</h3>
                  <p className="text-sm font-medium text-brand">{m.role}</p>
                  <p className="mt-2 text-sm leading-relaxed text-body">{m.bio}</p>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Stats />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

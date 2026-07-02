"use client";

import {
  ArrowRight,
  BarChart3,
  Zap,
  TrendingUp,
  ShieldCheck,
  Scale,
  PieChart,
  Wallet,
  FileText,
} from "lucide-react";
import Image from "next/image";
import { Section, SectionHeading } from "@/components/ui/primitives";
import { CardCarousel, carouselCardClass } from "@/components/ui/card-carousel";
import { caseStudies, caseStudyDetails } from "@/lib/content";

const ICONS = [BarChart3, Zap, TrendingUp, ShieldCheck, Scale, PieChart, Wallet, FileText];

export function CaseStudies() {
  return (
    <Section id="case-studies">
      <CardCarousel
        heading={
          <SectionHeading eyebrow="Case studies" title="Real engagements, measurable outcomes." />
        }
      >
        {caseStudies.map((study, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <article
              key={study.title}
              data-card
              className={`group relative aspect-[3/4] overflow-hidden rounded-hero bg-night ${carouselCardClass}`}
            >
              <Image
                src={study.image}
                alt=""
                fill
                sizes="(max-width: 640px) 82vw, (max-width: 1024px) 46vw, 29vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-night/95 via-brand/75 to-brand/40" />

              {/* Resting state */}
              <div className="relative flex h-full flex-col justify-between p-6">
                <Icon className="size-7 text-orange-500" />
                <div>
                  <p className="font-display text-3xl font-bold text-white">{study.stat}</p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-white/50">
                    {study.statLabel}
                  </p>
                  <h3 className="mt-4 font-display text-xl font-bold leading-snug text-white">
                    {study.title}
                  </h3>
                </div>
              </div>

              {/* Hover reveal */}
              <div className="absolute inset-0 flex translate-y-full flex-col justify-end bg-orange-500 p-6 transition-transform duration-300 ease-out group-hover:translate-y-0">
                <Icon className="size-7 text-white" />
                <h3 className="mt-4 font-display text-xl font-bold leading-snug text-white">
                  {study.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/90">{study.body}</p>
                <a
                  href={`/case-studies/${caseStudyDetails[i].slug}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white"
                >
                  Read the case study <ArrowRight className="size-4" />
                </a>
              </div>
            </article>
          );
        })}
      </CardCarousel>
    </Section>
  );
}

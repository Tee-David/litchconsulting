"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/primitives";
import { CardCarousel, carouselCardClass } from "@/components/ui/card-carousel";
import { audiences } from "@/lib/content";

export function Audiences() {
  return (
    <Section>
      <CardCarousel heading={<SectionHeading eyebrow="Who we help" title={audiences.title} />}>
        {audiences.cards.map((card) => (
          <article
            key={card.title}
            data-card
            className={`group relative aspect-[3/4] overflow-hidden rounded-hero ${carouselCardClass}`}
          >
            <Image
              src={card.image}
              alt=""
              fill
              draggable={false}
              sizes="(max-width: 640px) 82vw, (max-width: 1024px) 46vw, 29vw"
              className="select-none object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-night/90 via-night/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <span className="mb-2 inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-white backdrop-blur-md">
                {card.tag}
              </span>
              <h3 className="text-shadow-soft max-w-[95%] font-display text-base font-bold leading-snug text-white">
                {card.title}
              </h3>
              <p className="text-shadow-soft mt-1.5 max-w-[95%] text-sm text-white/80">{card.body}</p>
              <a
                href="#contact"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-white hover:text-highlight"
              >
                Learn more <ArrowUpRight className="size-4" />
              </a>
            </div>
          </article>
        ))}
      </CardCarousel>
    </Section>
  );
}

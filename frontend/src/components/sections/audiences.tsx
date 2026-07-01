"use client";

import { useRef } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/primitives";
import { audiences } from "@/lib/content";

export function Audiences() {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-card]");
    const amount = card ? card.offsetWidth + 16 : 320;
    track.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  return (
    <Section>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <SectionHeading eyebrow={audiences.eyebrow} title={audiences.title} />
        <div className="flex gap-2">
          <button
            onClick={() => scrollBy(-1)}
            aria-label="Previous"
            className="grid size-11 place-items-center rounded-full border border-hairline bg-white text-ink transition-colors hover:border-brand hover:text-brand"
          >
            <ArrowLeft className="size-5" />
          </button>
          <button
            onClick={() => scrollBy(1)}
            aria-label="Next"
            className="grid size-11 place-items-center rounded-full border border-hairline bg-white text-ink transition-colors hover:border-brand hover:text-brand"
          >
            <ArrowRight className="size-5" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2"
      >
        {audiences.cards.map((card) => (
          <article
            key={card.title}
            data-card
            className="group relative aspect-[3/4] w-[78%] shrink-0 snap-start overflow-hidden rounded-hero sm:w-[46%] lg:w-[calc(40%-0.5rem)]"
          >
            <Image
              src={card.image}
              alt=""
              fill
              sizes="(max-width: 640px) 78vw, (max-width: 1024px) 46vw, 40vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <span className="mb-2 inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-white backdrop-blur-md">
                {card.tag}
              </span>
              <h3 className="font-display text-xl font-bold text-white">{card.title}</h3>
              <p className="mt-1.5 text-sm text-white/75">{card.body}</p>
              <a
                href="#contact"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-white hover:text-highlight"
              >
                Learn more <ArrowUpRight className="size-4" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

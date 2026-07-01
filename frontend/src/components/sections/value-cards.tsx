"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { ArrowUpRight } from "lucide-react";
import { Section, SectionHeading, Reveal } from "@/components/ui/primitives";
import { valueCards } from "@/lib/content";

const ScrollStack = dynamic(() => import("@/components/ui/ScrollStack"), { ssr: false });

type Card = (typeof valueCards)[number];

function ValueCard({ card }: { card: Card }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-card border border-hairline bg-white shadow-sm shadow-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/5">
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={card.image}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-ink">{card.title}</h3>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
            <ArrowUpRight className="size-4" />
          </span>
        </div>
        <p className="text-sm leading-relaxed text-body">{card.body}</p>
      </div>
    </article>
  );
}

export function ValueCards() {
  return (
    <Section id="about">
      <SectionHeading
        eyebrow="Our partnership promise"
        title="A holistic finance partner that delivers real results."
        body="Reporting, modelling and compliance under one roof; so nothing about your finances is left to chance."
        align="center"
      />

      {/* Desktop: grid */}
      <div className="mt-14 hidden gap-6 md:grid md:grid-cols-3">
        {valueCards.map((card, i) => (
          <Reveal key={card.title} delay={i * 0.08}>
            <ValueCard card={card} />
          </Reveal>
        ))}
      </div>

      {/* Mobile: scroll-stacking cards */}
      <div className="mt-10 md:hidden">
        <ScrollStack className="h-[78vh]">
          {valueCards.map((card) => (
            <div key={card.title} className="scroll-stack-card">
              <ValueCard card={card} />
            </div>
          ))}
        </ScrollStack>
      </div>
    </Section>
  );
}

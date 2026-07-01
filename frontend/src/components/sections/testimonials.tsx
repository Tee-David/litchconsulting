"use client";

import { Quote, Star } from "lucide-react";
import { testimonials } from "@/lib/content";

type Testimonial = (typeof testimonials)[number];

const AVATAR_COLORS = ["#0a196d", "#2540c4", "#4c6ef5", "#1e9df5", "#0f766e", "#7c3aed"];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
}

function Card({ t, i }: { t: Testimonial; i: number }) {
  return (
    <figure className="flex w-[300px] shrink-0 flex-col gap-4 rounded-card border border-hairline bg-surface p-6 sm:w-[380px]">
      <Quote className="size-7 text-brand" />
      <blockquote className="text-sm leading-relaxed text-ink sm:text-[0.95rem]">
        {t.quote}
      </blockquote>
      <figcaption className="mt-auto flex items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
          style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
        >
          {initials(t.name)}
        </span>
        <span>
          <span className="block text-sm font-semibold text-ink">{t.name}</span>
          <span className="block text-xs text-muted">{t.role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function Row({ items, reverse }: { items: Testimonial[]; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
      <div
        className={`flex w-max gap-4 pr-4 ${reverse ? "animate-[marquee-rev_40s_linear_infinite]" : "animate-[marquee-fwd_40s_linear_infinite]"} group-hover:[animation-play-state:paused]`}
      >
        {doubled.map((t, i) => (
          <Card key={i} t={t} i={i} />
        ))}
      </div>
    </div>
  );
}

export function Testimonials() {
  const mid = Math.ceil(testimonials.length / 2);
  const rowA = testimonials.slice(0, mid);
  const rowB = testimonials.slice(mid);

  return (
    <section className="px-3 md:px-4">
      <div className="mx-auto max-w-[1400px] overflow-hidden rounded-hero bg-brand px-4 py-16 sm:px-8 md:py-20">
        <div className="mx-auto max-w-3xl px-2 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-white">
            <Star className="size-3.5 fill-highlight text-highlight" />
            Rated 5/5 by clients across sectors
          </span>
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight tracking-tight text-white text-balance sm:text-4xl md:text-[2.75rem]">
            Words of praise from those we&rsquo;ve helped.
          </h2>
        </div>

        <div className="mt-12 flex flex-col gap-4">
          <Row items={rowA} />
          <Row items={rowB} reverse />
        </div>
      </div>

      <style>{`
        @keyframes marquee-fwd { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes marquee-rev { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[marquee-fwd_40s_linear_infinite\\],
          .animate-\\[marquee-rev_40s_linear_infinite\\] { animation: none; }
        }
      `}</style>
    </section>
  );
}

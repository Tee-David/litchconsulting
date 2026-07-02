"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/primitives";
import { solutions } from "@/lib/content";
import { cn } from "@/lib/utils";

export function Solutions() {
  const [active, setActive] = useState(0);

  return (
    <Section id="services">
      <SectionHeading eyebrow={solutions.eyebrow} title={solutions.title} align="center" />

      {/* Desktop: expanding panels revealed on hover */}
      <div className="mt-14 hidden gap-3 md:flex md:h-[460px]">
        {solutions.items.map((item, i) => {
          const isActive = i === active;
          return (
            <div
              key={item.title}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              tabIndex={0}
              role="button"
              aria-label={item.title}
              className={cn(
                "group relative cursor-pointer overflow-hidden rounded-xl2 border border-hairline transition-[flex] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                isActive ? "flex-[4]" : "flex-[1]"
              )}
            >
              <Image
                src={item.image}
                alt=""
                fill
                sizes="(max-width: 1280px) 40vw, 30vw"
                className={cn(
                  "object-cover transition-all duration-700",
                  isActive ? "scale-100 opacity-100" : "scale-110 opacity-0"
                )}
              />
              {/* Collapsed state background */}
              <div
                className={cn(
                  "absolute inset-0 transition-opacity duration-500",
                  isActive ? "opacity-0" : "opacity-100 bg-surface"
                )}
              />
              <div
                className={cn(
                  "absolute inset-0 transition-opacity duration-500",
                  isActive ? "bg-gradient-to-t from-night/90 via-night/30 to-transparent opacity-100" : "opacity-0"
                )}
              />

              {/* Collapsed label (vertical) */}
              <div
                className={cn(
                  "absolute inset-0 flex flex-col items-center justify-between py-6 transition-opacity duration-300",
                  isActive ? "opacity-0" : "opacity-100"
                )}
              >
                <span className="font-display text-sm font-bold text-brand">{item.no}</span>
                <span className="[writing-mode:vertical-rl] rotate-180 font-display text-base font-semibold tracking-tight text-ink">
                  {item.title}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
                  {item.kind}
                </span>
              </div>

              {/* Expanded content */}
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 p-7 transition-all duration-500",
                  isActive ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                )}
              >
                <span className="mb-3 inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-white backdrop-blur-md">
                  {item.no} · {item.kind}
                </span>
                <h3 className="font-display text-2xl font-bold text-white">{item.title}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-white/80">{item.body}</p>
                <a
                  href="#contact"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white hover:text-highlight"
                >
                  Discuss this service <ArrowUpRight className="size-4" />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: stacked cards */}
      <div className="mt-10 grid gap-4 md:hidden">
        {solutions.items.map((item) => (
          <article
            key={item.title}
            className="relative overflow-hidden rounded-card border border-hairline"
          >
            <div className="relative h-44">
              <Image src={item.image} alt="" fill sizes="100vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-night/90 to-night/20" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <span className="text-xs font-medium uppercase tracking-widest text-highlight">
                  {item.no} · {item.kind}
                </span>
                <h3 className="font-display text-xl font-bold text-white">{item.title}</h3>
              </div>
            </div>
            <p className="p-5 text-sm leading-relaxed text-body">{item.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

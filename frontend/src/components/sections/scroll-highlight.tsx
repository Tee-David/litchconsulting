"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scrollHighlight } from "@/lib/content";

export function ScrollHighlight() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const words = el.querySelectorAll<HTMLElement>("[data-word]");

    if (reduce) {
      words.forEach((w) => (w.style.opacity = "1"));
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    // Animate OPACITY, not colour: the text keeps the theme-aware `text-ink`
    // token, so it stays correct (and updates live) when the theme is toggled
    // without a reload. Unfilled = dim (0.25), filled = full.
    const ctx = gsap.context(() => {
      gsap.fromTo(
        words,
        { opacity: 0.25 },
        {
          opacity: 1,
          stagger: 0.5,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top 75%",
            end: "bottom 60%",
            scrub: true,
          },
        },
      );
    }, el);

    return () => ctx.revert();
  }, []);

  const words = scrollHighlight.text.split(" ");

  return (
    <section className="py-24 md:py-36">
      <div className="container-page" ref={containerRef}>
        <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.18em] text-brand">
          {scrollHighlight.lead}
        </p>
        <p className="mx-auto max-w-4xl text-center font-display text-2xl font-bold leading-snug tracking-tight text-balance sm:text-3xl md:text-[2.6rem] md:leading-[1.25]">
          {words.map((word, i) => (
            <span key={i} data-word className="text-ink" style={{ opacity: 0.25, transition: "none" }}>
              {word}{" "}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

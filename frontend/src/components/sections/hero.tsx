"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { heroSlides, partners } from "@/lib/content";
import { OrbitingCircles } from "@/components/magicui/orbiting-circles";
import { orbitOuter, orbitInner } from "@/components/sections/hero-orbit-icons";

const ROTATE_MS = 6000;

export function Hero() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % heroSlides.length), ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  const slide = heroSlides[index];

  return (
    <section
      id="top"
      data-hero
      className="relative flex min-h-[100svh] w-full flex-col justify-center overflow-hidden md:justify-end"
    >
      {/* Background slider — Ken Burns slow zoom-in per slide */}
      <AnimatePresence>
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: 1, scale: 1.1 }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
            scale: { duration: ROTATE_MS / 1000 + 1.2, ease: "linear" },
          }}
          className="absolute inset-0"
        >
          <Image src={slide.image} alt="" fill priority sizes="100vw" className="object-cover" />
        </motion.div>
      </AnimatePresence>

      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-night/90 via-night/45 to-night/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-brand/50 to-transparent" />

      {/* Orbiting work-tool logos — bleeds off the right edge, only ~half visible */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-0 z-[1] hidden h-[612px] w-[612px] -translate-y-1/2 translate-x-[38%] lg:block xl:translate-x-[32%]"
      >
        <div className="relative size-full">
          <OrbitingCircles iconSize={48} radius={266} duration={44}>
            {orbitOuter}
          </OrbitingCircles>
          <OrbitingCircles iconSize={40} radius={176} duration={34} reverse>
            {orbitInner}
          </OrbitingCircles>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pb-32 pt-28 md:px-14 md:pb-48">
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            <span className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-3.5 fill-amber-400 text-amber-400" />
              ))}
            </span>
            4.7 · 1,000+ reviews
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-3xl"
            >
              <p className="text-shadow-soft mb-3 text-sm font-medium uppercase tracking-[0.16em] text-white/85">
                {slide.eyebrow}
              </p>
              <h1 className="text-shadow-hero font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight text-white text-pretty sm:text-5xl sm:text-balance md:text-6xl lg:text-[4.25rem]">
                {slide.headline}
              </h1>
              <p className="text-shadow-soft mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/85 md:mx-0 md:text-lg">
                {slide.sub}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button href="/get-started" withArrow className="w-full sm:w-auto">
              Get Started
            </Button>
            <Button href="/book" variant="light" withArrow className="w-full sm:w-auto">
              Book a Consultation
            </Button>
          </div>
        </div>
      </div>

      {/* Partner logos marquee — pinned along the bottom of the hero */}
      <div className="absolute inset-x-0 bottom-0 z-10 pb-6 md:pb-8">
        <p className="mb-4 text-center text-[0.7rem] font-medium uppercase tracking-[0.18em] text-white/55">
          We collaborate with forward-thinking businesses
        </p>
        <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <div className="flex w-max animate-[marquee_28s_linear_infinite] items-center gap-14 pr-14">
            {[...partners, ...partners, ...partners, ...partners].map((name, i) => (
              <span
                key={i}
                className="font-display text-lg font-bold tracking-tight text-white/40 transition-colors hover:text-white md:text-xl"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

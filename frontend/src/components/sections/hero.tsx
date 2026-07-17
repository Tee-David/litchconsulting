"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { heroSlides, partners } from "@/lib/content";
import { OrbitingCircles } from "@/components/magicui/orbiting-circles";
import { orbitOuter, orbitInner, orbitCore } from "@/components/sections/hero-orbit-icons";

const ROTATE_MS = 6000;

const RATING = 4.7;

/** Reviewer faces. Served straight from Unsplash — already sized by query param
 *  and allow-listed in `next.config.ts` (the optimizer is off site-wide). */
const reviewerAvatars = [
  "1494790108377-be9c29b29330",
  "1500648767791-00dcc994a43e",
  "1438761681033-6461ffad8d80",
  "1507003211169-0a1dd7228f2d",
  "1544005313-94ddf0286df2",
].map((id) => `https://images.unsplash.com/photo-${id}?w=64&h=64&q=80&fit=crop&crop=faces`);

/**
 * Renders the true score: whole stars fill completely, the remainder fills a
 * fractional sliver of the next one (4.7 → four full + 70% of the fifth), so
 * the badge can't overstate the rating.
 */
function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => {
        // Rounded: 4.7 - 4 is 0.7000000000000002 in binary float, which would
        // otherwise reach the DOM as width:70.00000000000003%.
        const fill = Math.round(Math.max(0, Math.min(1, rating - i)) * 100);
        return (
          <span key={i} className="relative inline-flex">
            <Star className="size-3.5 fill-white/25 text-white/30" />
            {fill > 0 && (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fill}%` }}
              >
                <Star className="size-3.5 max-w-none fill-amber-400 text-amber-400" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

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

      {/* Orbiting work-tool logos. translate-x-50% puts the rings' centre exactly
          on the viewport edge, so precisely the left half shows at every width. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-0 z-[1] hidden h-[612px] w-[612px] -translate-y-1/2 translate-x-[50%] lg:block"
      >
        <div className="relative size-full">
          <OrbitingCircles iconSize={48} radius={266} duration={44}>
            {orbitOuter}
          </OrbitingCircles>
          <OrbitingCircles iconSize={40} radius={176} duration={34} reverse>
            {orbitInner}
          </OrbitingCircles>
          <OrbitingCircles iconSize={34} radius={92} duration={26}>
            {orbitCore}
          </OrbitingCircles>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pb-32 pt-28 md:px-14 md:pb-48">
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <div className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/10 py-1.5 pl-2 pr-3.5 text-xs font-medium text-white backdrop-blur-md">
            <span className="flex -space-x-2">
              {reviewerAvatars.map((src, i) => (
                <span
                  key={i}
                  className="relative size-6 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/40"
                >
                  <Image src={src} alt="" fill sizes="24px" className="object-cover" unoptimized />
                </span>
              ))}
            </span>
            <span className="flex items-center gap-2">
              <StarRating rating={RATING} />
              {RATING} · 1k+ reviews
            </span>
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

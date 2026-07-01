"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { heroSlides } from "@/lib/content";

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
    <section id="top" className="px-3 pt-20 md:px-4 md:pt-24">
      <div className="relative mx-auto flex min-h-[640px] max-w-[1400px] flex-col justify-end overflow-hidden rounded-hero md:min-h-[760px]">
        {/* Background slider */}
        <AnimatePresence>
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <Image
              src={slide.image}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </motion.div>
        </AnimatePresence>

        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/45 to-ink/25" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand/50 to-transparent" />

        {/* Content */}
        <div className="relative z-10 p-6 pb-10 sm:p-10 md:p-14 lg:p-16">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            <span className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-3.5 fill-highlight text-highlight" />
              ))}
            </span>
            Trusted financial advisory · 5.0 client rating
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
              <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-highlight">
                {slide.eyebrow}
              </p>
              <h1 className="font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight text-white text-pretty sm:text-5xl sm:text-balance md:text-6xl lg:text-[4.25rem]">
                {slide.headline}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
                {slide.sub}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button href="/book" withArrow className="w-full sm:w-auto">
              Book a Consultation
            </Button>
            <Button href="/#services" variant="light" withArrow className="w-full sm:w-auto">
              Explore Services
            </Button>
          </div>

          {/* Slide indicators */}
          <div className="mt-10 flex items-center gap-2">
            {heroSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Show slide ${i + 1}`}
                className="h-1 rounded-full bg-white/30 transition-all"
                style={{ width: i === index ? 36 : 14, background: i === index ? "#4c6ef5" : undefined }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

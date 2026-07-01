"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Quote, ArrowLeft, ArrowRight, Star } from "lucide-react";
import { Eyebrow } from "@/components/ui/primitives";
import { testimonials } from "@/lib/content";

export function Testimonials() {
  const [index, setIndex] = useState(0);
  const go = (dir: 1 | -1) =>
    setIndex((i) => (i + dir + testimonials.length) % testimonials.length);
  const t = testimonials[index];

  // Auto-advance every 5 seconds; resets whenever the active slide changes.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setTimeout(() => setIndex((i) => (i + 1) % testimonials.length), 5000);
    return () => clearTimeout(id);
  }, [index]);

  return (
    <section className="px-3 md:px-4">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-hero bg-ink px-6 py-16 text-white md:px-16 md:py-24">
        <div className="absolute inset-0 bg-dot-grid opacity-50" />
        <div className="absolute -left-20 bottom-0 size-80 rounded-full bg-brand/40 blur-3xl" />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <Eyebrow tone="dark">What our clients say</Eyebrow>
          <Quote className="mt-8 size-10 text-highlight" />

          <div className="mt-6 min-h-[180px] md:min-h-[150px]">
            <AnimatePresence mode="wait">
              <motion.blockquote
                key={index}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4 }}
              >
                <p className="font-display text-xl font-medium leading-snug text-balance md:text-2xl">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <footer className="mt-6">
                  <div className="mb-2 flex justify-center">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="size-4 fill-highlight text-highlight" />
                    ))}
                  </div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-white/60">{t.role}</p>
                </footer>
              </motion.blockquote>
            </AnimatePresence>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <button
              onClick={() => go(-1)}
              aria-label="Previous testimonial"
              className="grid size-11 place-items-center rounded-full border border-white/20 text-white transition-colors hover:bg-white/10"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div className="flex gap-1.5">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  aria-label={`Testimonial ${i + 1}`}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === index ? 28 : 8,
                    background: i === index ? "#4c6ef5" : "rgba(255,255,255,0.3)",
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => go(1)}
              aria-label="Next testimonial"
              className="grid size-11 place-items-center rounded-full border border-white/20 text-white transition-colors hover:bg-white/10"
            >
              <ArrowRight className="size-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "@/components/ui/logo";

const IMAGE =
  "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80";

const QUOTES = [
  {
    q: "Litch turned our messy books into a board-ready story in a matter of weeks.",
    name: "Adaeze Okafor",
    role: "Managing Director, Meridian Foods",
  },
  {
    q: "The clearest financial advice we've had. Every number came with a decision attached.",
    name: "Tunde Bakare",
    role: "Founder, Apex Capital",
  },
];

/** Left brand panel — image, wordmark, rotating client testimonial. */
export function BrandPanel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % QUOTES.length), 6000);
    return () => clearInterval(t);
  }, []);
  const active = QUOTES[i];

  return (
    <div className="relative hidden overflow-hidden lg:block">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${IMAGE})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-brand/85 via-brand/70 to-night/85" />

      <div className="relative flex h-full flex-col justify-between p-9">
        <Link href="/" aria-label="Back to Litch Consulting website" className="w-fit">
          <Logo tone="light" />
        </Link>

        <figure className="max-w-sm">
          <AnimatePresence mode="wait">
            <motion.blockquote
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="font-display text-2xl font-bold leading-snug text-white text-balance">
                &ldquo;{active.q}&rdquo;
              </p>
              <figcaption className="mt-5">
                <div className="text-sm font-semibold text-white">{active.name}</div>
                <div className="text-xs text-white/70">{active.role}</div>
              </figcaption>
            </motion.blockquote>
          </AnimatePresence>

          <div className="mt-6 flex gap-1.5">
            {QUOTES.map((_, idx) => (
              <span
                key={idx}
                className={`h-1 rounded-full transition-all ${
                  idx === i ? "w-6 bg-white" : "w-2 bg-white/40"
                }`}
              />
            ))}
          </div>
        </figure>
      </div>
    </div>
  );
}

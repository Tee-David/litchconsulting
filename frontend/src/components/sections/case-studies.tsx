"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Section, SectionHeading, Eyebrow, Button } from "@/components/ui/primitives";
import { caseStudies } from "@/lib/content";

export function CaseStudies() {
  const [index, setIndex] = useState(0);
  const go = (dir: 1 | -1) =>
    setIndex((i) => (i + dir + caseStudies.length) % caseStudies.length);
  const study = caseStudies[index];

  return (
    <Section id="case-studies">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <SectionHeading eyebrow="Case studies" title="Real engagements, measurable outcomes." />
        <div className="flex gap-2">
          <button
            onClick={() => go(-1)}
            aria-label="Previous case study"
            className="grid size-11 place-items-center rounded-full border border-hairline bg-white text-ink transition-colors hover:border-brand hover:text-brand"
          >
            <ArrowLeft className="size-5" />
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Next case study"
            className="grid size-11 place-items-center rounded-full border border-hairline bg-white text-ink transition-colors hover:border-brand hover:text-brand"
          >
            <ArrowRight className="size-5" />
          </button>
        </div>
      </div>

      <div className="mt-10 overflow-hidden rounded-hero border border-hairline bg-white">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="grid lg:grid-cols-2"
          >
            <div className="relative min-h-[280px] lg:min-h-[440px]">
              <Image
                src={study.image}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute bottom-5 left-5 rounded-2xl bg-white/90 px-5 py-4 backdrop-blur-md">
                <p className="font-display text-3xl font-bold text-brand">{study.stat}</p>
                <p className="text-xs text-muted">{study.statLabel}</p>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-5 p-8 md:p-12">
              <Eyebrow>{study.tag}</Eyebrow>
              <h3 className="font-display text-2xl font-bold leading-tight tracking-tight text-balance md:text-3xl">
                {study.title}
              </h3>
              <p className="text-body">{study.body}</p>
              <div>
                <Button href="#contact" withArrow>
                  Read the case study
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 flex justify-center gap-1.5">
        {caseStudies.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Case study ${i + 1}`}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: i === index ? 28 : 8,
              background: i === index ? "#0a196d" : "#e6e8f0",
            }}
          />
        ))}
      </div>
    </Section>
  );
}

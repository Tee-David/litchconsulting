"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/primitives";
import { faqs } from "@/lib/content";
import { cn } from "@/lib/utils";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section id="faq">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1fr]">
        <SectionHeading
          eyebrow="FAQ"
          title="Frequently asked questions"
          body="Everything you need to know before we begin. Still curious? Book a consultation and we'll answer in detail."
        />

        <div className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {faqs.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-base font-semibold text-ink md:text-lg">
                    {item.q}
                  </span>
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full border border-hairline transition-all duration-300",
                      isOpen ? "rotate-45 bg-brand text-white" : "text-ink"
                    )}
                  >
                    <Plus className="size-4" />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 pr-12 text-sm leading-relaxed text-body">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

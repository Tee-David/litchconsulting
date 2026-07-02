"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Check, X } from "lucide-react";
import { Section, SectionHeading, Reveal } from "@/components/ui/primitives";
import { impact } from "@/lib/content";

function Donut() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const radius = 70;
  const circumference = 2 * Math.PI * radius;

  const segments = impact.chart.reduce<
    { label: string; color: string; dash: string; dashoffset: number; end: number }[]
  >((acc, seg) => {
    const start = acc.length ? acc[acc.length - 1].end : 0;
    const len = (seg.value / 100) * circumference;
    acc.push({
      label: seg.label,
      color: seg.color,
      dash: `${len} ${circumference - len}`,
      dashoffset: -start,
      end: start + len,
    });
    return acc;
  }, []);

  return (
    <div ref={ref} className="relative mx-auto aspect-square w-full max-w-[320px]">
      <svg viewBox="0 0 180 180" className="size-full -rotate-90">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--color-surface)" strokeWidth="22" />
        {segments.map((seg) => (
          <motion.circle
            key={seg.label}
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth="22"
            strokeDasharray={seg.dash}
            strokeDashoffset={seg.dashoffset}
            initial={{ opacity: 0, strokeDasharray: `0 ${circumference}` }}
            animate={inView ? { opacity: 1, strokeDasharray: seg.dash } : {}}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-4xl font-bold text-brand">42%</span>
        <span className="max-w-[8rem] text-xs text-muted">
          avg. reporting-accuracy gain
        </span>
      </div>
    </div>
  );
}

export function Impact() {
  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading eyebrow={impact.eyebrow} title={impact.title} body={impact.body} />

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <Reveal>
              <div className="rounded-card border border-hairline bg-surface p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <X className="size-4 text-red-500" /> Before Litch
                </p>
                <ul className="space-y-2.5">
                  {impact.before.map((b) => (
                    <li key={b} className="text-sm text-body">{b}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="rounded-card border border-brand-soft bg-brand-tint p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand">
                  <Check className="size-4" /> With Litch
                </p>
                <ul className="space-y-2.5">
                  {impact.after.map((b) => (
                    <li key={b} className="text-sm text-ink">{b}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>

        <Reveal delay={0.1}>
          <div className="rounded-hero border border-hairline bg-paper p-8 shadow-xl shadow-brand/5">
            <p className="mb-6 text-center font-display text-sm font-semibold text-ink">
              Impact metrics after our consulting
            </p>
            <Donut />
            <div className="mt-6 flex flex-col gap-2">
              {impact.chart.map((seg) => (
                <div key={seg.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-body">
                    <span className="size-3 rounded-full" style={{ background: seg.color }} />
                    {seg.label}
                  </span>
                  <span className="font-display font-bold text-ink">{seg.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

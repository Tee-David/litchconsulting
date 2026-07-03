"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDownRight } from "lucide-react";
import { Logo } from "@/components/ui/logo";

/**
 * Finance-native 404: a market chart that rallies then crashes to "404".
 * The trend line draws in, plummets off a cliff, and a pulsing marker drops a
 * floating tooltip at the low. Fully responsive (SVG scales to its container).
 */
const LINE = "M0,200 L70,165 L150,178 L225,120 L300,88 L370,58 L430,150 L470,210 L520,232 L600,226";
const AREA = `${LINE} L600,260 L0,260 Z`;
const EASE = [0.22, 1, 0.36, 1] as const;

export function Finance404() {
  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden bg-paper">
      {/* grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-ink) 1px,transparent 1px),linear-gradient(90deg,var(--color-ink) 1px,transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* brand bar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-6 md:px-12">
        <Link href="/" aria-label="Litch home">
          <Logo className="h-9" />
        </Link>
        <Link href="/" className="text-sm font-medium text-muted transition-colors hover:text-ink">
          litchconsulting.com
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-xs font-semibold uppercase tracking-[0.3em] text-brand"
        >
          Error 404 · Market correction
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl md:text-6xl"
        >
          This page took a <span className="text-gradient-brand">downturn</span>.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-5 max-w-md text-[15px] leading-relaxed text-body"
        >
          The figure you&rsquo;re looking for isn&rsquo;t on our books — the trend didn&rsquo;t hold. Let&rsquo;s
          get you back to solid ground.
        </motion.p>

        {/* Chart */}
        <div className="relative mt-10 w-full">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="font-display text-[28vw] font-black leading-none text-ink/[0.04] sm:text-[13rem]">404</span>
          </div>

          <svg viewBox="0 0 600 260" className="relative w-full" role="img" aria-label="A market chart crashing to 404">
            <defs>
              <linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4c6ef5" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#4c6ef5" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* gridlines */}
            {[65, 130, 195].map((y) => (
              <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="var(--color-hairline)" strokeWidth="1" />
            ))}

            <motion.path
              d={AREA}
              fill="url(#crashFill)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1 }}
            />
            <motion.path
              d={LINE}
              fill="none"
              stroke="#4c6ef5"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.7, ease: EASE }}
            />
            {/* crash marker */}
            <motion.circle
              cx="520" cy="232" r="6" fill="#dc2626"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.5, type: "spring", stiffness: 300, damping: 12 }}
            />
            <motion.circle
              cx="520" cy="232" r="6" fill="none" stroke="#dc2626" strokeWidth="2"
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ delay: 1.7, duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            />
          </svg>

          {/* floating tooltip near the crash */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.7, duration: 0.4 }}
            className="absolute bottom-2 right-[10%] flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-2.5 py-1.5 text-xs font-semibold shadow-lg shadow-black/10"
          >
            <ArrowDownRight className="size-3.5 text-red-500" />
            <span className="text-ink">−404.00</span>
            <span className="text-muted">off the chart</span>
          </motion.div>
        </div>

        {/* CTAs */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/25"
          >
            Back home
          </Link>
          <Link
            href="/services"
            className="rounded-full border border-hairline px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand dark:hover:border-white dark:hover:text-white"
          >
            Our services
          </Link>
          <Link
            href="/contact"
            className="rounded-full border border-hairline px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand dark:hover:border-white dark:hover:text-white"
          >
            Contact us
          </Link>
        </div>
      </main>
    </section>
  );
}

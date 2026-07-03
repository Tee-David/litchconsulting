"use client";

import { motion } from "framer-motion";
import { WifiOff, RotateCw } from "lucide-react";
import { Logo } from "@/components/ui/logo";

/**
 * Creative offline screen: the market "feed" goes quiet — an active ticker
 * flatlines into a dashed line with a scanning pulse trying to reconnect.
 * Finance-native and distinct from the 404 (which crashes).
 */
const ACTIVE = "M0,60 L40,52 L70,66 L100,40 L130,70 L160,48 L190,62 L220,44 L250,60";
const FLAT = "M250,60 L600,60";

export function FinanceOffline() {
  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden bg-paper">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-ink) 1px,transparent 1px),linear-gradient(90deg,var(--color-ink) 1px,transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <header className="relative z-20 flex items-center justify-between px-6 py-6 md:px-12">
        <Logo className="h-9" />
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
          <span className="size-2 rounded-full bg-red-500" /> Offline
        </span>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-brand-tint text-brand">
          <WifiOff className="size-7" />
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand">No signal</p>
        <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">
          The feed went <span className="text-gradient-brand">quiet</span>.
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-body">
          We can&rsquo;t reach the network right now — the live data stopped coming through. Reconnect and your Litch
          dashboard picks up right where it left off.
        </p>

        {/* Flatlining ticker */}
        <div className="relative mt-10 w-full max-w-lg">
          <svg viewBox="0 0 600 120" className="w-full" role="img" aria-label="A market ticker flatlining">
            <line x1="0" x2="600" y1="60" y2="60" stroke="var(--color-hairline)" strokeWidth="1" />
            <motion.path
              d={ACTIVE}
              fill="none"
              stroke="#4c6ef5"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
            <motion.path
              d={FLAT}
              fill="none"
              stroke="#8a92a6"
              strokeWidth="2"
              strokeDasharray="6 7"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 1, duration: 0.8, ease: "linear" }}
            />
            {/* scanning pulse trying to reconnect */}
            <motion.circle
              cy="60"
              r="4"
              fill="#4c6ef5"
              initial={{ cx: 250 }}
              animate={{ cx: [250, 600, 250] }}
              transition={{ delay: 1.6, duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </svg>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-muted">
            reconnecting
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="size-1 rounded-full bg-muted"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/25"
        >
          <RotateCw className="size-4" /> Try again
        </button>
      </main>
    </section>
  );
}

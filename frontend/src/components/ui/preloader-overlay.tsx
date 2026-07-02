"use client";

import { motion } from "framer-motion";
import { LogoMark } from "./logo";

/**
 * Dramatic intro: the "LITCH / CONSULTING" wordmark starts centred, then the
 * emblem springs in from the left — its width springing open recentres the
 * group and shoves the wordmark to the right, landing everything in the static
 * logo lockup. The overlay then fades to reveal the page.
 */
export function PreloaderOverlay() {
  const spring = { type: "spring" as const, stiffness: 420, damping: 17, mass: 0.9 };

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-paper"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
    >
      <div className="flex items-center">
        {/* emblem — width springs open (pushes the wordmark) while the mark rushes in from the left */}
        <motion.div
          className="flex justify-end overflow-hidden"
          initial={{ width: 0 }}
          animate={{ width: 160 }}
          transition={{ ...spring, delay: 0.12 }}
        >
          <motion.span
            className="pr-3.5"
            initial={{ x: -150, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ ...spring, delay: 0.12 }}
          >
            <LogoMark className="size-[7rem]" />
          </motion.span>
        </motion.div>

        {/* wordmark — starts centred, gets shoved right into the lockup */}
        <span className="border-l border-hairline pl-3 leading-none">
          <span className="block font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            LITCH
          </span>
          <span className="mt-1 block text-xs font-semibold tracking-[0.34em] text-body sm:text-sm">
            CONSULTING
          </span>
        </span>
      </div>
    </motion.div>
  );
}

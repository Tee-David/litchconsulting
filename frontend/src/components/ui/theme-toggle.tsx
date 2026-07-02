"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { animateThemeChange } from "@/lib/theme-transition";

/**
 * Pill theme switcher. The icon shows the current mode and sits opposite the
 * knob; the knob slides with a spring and the icon rolls in like a wheel. The
 * click triggers a circle-wipe view transition from the pointer position.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const spring = { type: "spring" as const, stiffness: 700, damping: 24, mass: 0.6 };

  // geometry: 56x32 track, 26px knob, 3px inset
  const knobX = isDark ? 3 : 27;
  const iconX = isDark ? 29 : 5;

  return (
    <button
      type="button"
      onClick={(e) =>
        animateThemeChange(isDark ? "light" : "dark", setTheme, { x: e.clientX, y: e.clientY })
      }
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className={`relative h-8 w-14 shrink-0 overflow-hidden rounded-full outline-none transition-colors duration-500 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
        isDark
          ? "bg-[#38414f] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]"
          : "bg-[#1e9df5] shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]"
      } ${className}`}
    >
      <motion.span
        className="pointer-events-none absolute top-0 flex h-8 w-[22px] items-center justify-center"
        animate={{ x: iconX }}
        transition={spring}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "sun" : "moon"}
            initial={{ rotate: -180, scale: 0.3, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 180, scale: 0.3, opacity: 0 }}
            transition={{ type: "spring", stiffness: 650, damping: 22, mass: 0.5 }}
            className="flex text-white"
          >
            {isDark ? <Sun size={17} /> : <Moon size={16} fill="currentColor" />}
          </motion.span>
        </AnimatePresence>
      </motion.span>

      <motion.span
        className="absolute left-0 top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.35)]"
        animate={{ x: knobX, rotate: isDark ? -180 : 0 }}
        transition={spring}
      />
    </button>
  );
}

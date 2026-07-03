"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { PreloaderOverlay } from "./preloader-overlay";

const KEY = "litch:preloaded";

/**
 * Shows the intro preloader once per browser session (and never when the user
 * prefers reduced motion). Non-blocking: the overlay is fixed + pointer-events
 * none, so it never locks scroll.
 */
export function PagePreloader() {
  // Start visible so the overlay covers the page from the very first paint
  // (rather than flashing the homepage content first). The effect hides it
  // immediately when it shouldn't run (already seen this session / reduced
  // motion), otherwise it plays once and fades out.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
    } catch {}
    if (seen || reduced) {
      setVisible(false);
      return;
    }
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return <AnimatePresence>{visible && <PreloaderOverlay key="litch-preloader" />}</AnimatePresence>;
}

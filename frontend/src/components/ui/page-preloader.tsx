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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
    } catch {}
    if (seen || reduced) return;
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot intro on first mount
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1700);
    return () => clearTimeout(t);
  }, []);

  return <AnimatePresence>{visible && <PreloaderOverlay key="litch-preloader" />}</AnimatePresence>;
}

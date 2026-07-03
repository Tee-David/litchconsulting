"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin top progress bar during client-side route changes — smooth feedback for
 * in-app navigation. Starts on same-origin link clicks and completes when the
 * pathname changes.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTrickle = () => {
    if (trickle.current) {
      clearInterval(trickle.current);
      trickle.current = null;
    }
  };

  function start() {
    if (doneTimer.current) clearTimeout(doneTimer.current);
    stopTrickle();
    setActive(true);
    setWidth(8);
    trickle.current = setInterval(() => setWidth((w) => (w < 90 ? w + (90 - w) * 0.12 : w)), 180);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      const target = a.getAttribute("target");
      if (!href || href.startsWith("#") || target === "_blank" || a.hasAttribute("download")) return;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname) return;
      } catch {
        return;
      }
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!active) return;
    stopTrickle();
    const rafId = requestAnimationFrame(() => setWidth(100));
    doneTimer.current = setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 350);
    return () => {
      cancelAnimationFrame(rafId);
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]">
      <div
        className="h-full bg-highlight shadow-[0_0_10px_rgba(76,110,245,0.7)] transition-[width,opacity] duration-300 ease-out"
        style={{ width: `${width}%`, opacity: active ? 1 : 0 }}
      />
    </div>
  );
}

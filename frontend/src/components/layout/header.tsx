"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/primitives";
import { site } from "@/lib/content";
import { cn } from "@/lib/utils";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto max-w-[1400px] px-3 md:px-4">
        <div
          className={cn(
            "mt-3 flex items-center justify-between rounded-full border px-4 py-2.5 transition-all duration-300 md:px-5",
            scrolled
              ? "border-hairline bg-white/85 shadow-sm shadow-black/5 backdrop-blur-xl"
              : "border-transparent bg-transparent"
          )}
        >
          <a href="#top" aria-label="Litch Consulting home">
            <Logo />
          </a>

          <nav className="hidden items-center gap-7 md:flex">
            {site.nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-body transition-colors hover:text-brand"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:block">
            <Button href="#contact" withArrow>
              Book a Consultation
            </Button>
          </div>

          <button
            className="grid size-10 place-items-center rounded-full border border-hairline bg-white text-ink md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="container-page md:hidden"
          >
            <div className="mt-2 flex flex-col gap-1 rounded-3xl border border-hairline bg-white p-4 shadow-lg shadow-black/5">
              {site.nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-sm font-medium text-ink hover:bg-surface"
                >
                  {item.label}
                </a>
              ))}
              <Button href="#contact" className="mt-2 w-full" onClick={() => setOpen(false)} withArrow>
                Book a Consultation
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

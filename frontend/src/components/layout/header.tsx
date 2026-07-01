"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/primitives";
import BubbleMenu from "@/components/ui/BubbleMenu";
import { site } from "@/lib/content";
import { cn } from "@/lib/utils";

const mobileItems = [
  ...site.nav.map((n) => ({ label: n.label, href: n.href })),
  { label: "Book a consultation", href: "/book", hoverStyles: { bgColor: "#0a196d", textColor: "#ffffff" } },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-spy: underline the nav item whose section is in view.
  useEffect(() => {
    const ids = site.nav.map((n) => n.href.split("#")[1]).filter(Boolean);
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <header>
      {/* Desktop bar */}
      <div className="fixed inset-x-0 top-0 z-50 hidden md:block">
        <div className="mx-auto max-w-[1400px] px-3 md:px-4">
          <div
            className={cn(
              "mt-3 flex items-center justify-between rounded-full border px-5 py-2.5 transition-all duration-300",
              scrolled
                ? "border-hairline bg-white/85 shadow-sm shadow-black/5 backdrop-blur-xl"
                : "border-transparent bg-transparent"
            )}
          >
            <Link href="/" aria-label="Litch Consulting home">
              <Logo />
            </Link>

            <nav className="flex items-center gap-7">
              {site.nav.map((item) => {
                const id = item.href.split("#")[1];
                const isActive = id && active === id;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "text-sm font-medium underline-offset-8 transition-colors hover:text-brand",
                      isActive
                        ? "text-brand underline decoration-2"
                        : "text-body no-underline"
                    )}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>

            <Button href="/book" withArrow>
              Book a Consultation
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile bubble menu */}
      <div className="md:hidden">
        <BubbleMenu
          logo={<Logo />}
          items={mobileItems}
          menuBg="#ffffff"
          menuContentColor="#0a0e1a"
          useFixedPosition
        />
      </div>
    </header>
  );
}

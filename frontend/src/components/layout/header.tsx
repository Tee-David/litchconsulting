"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo, LogoMark } from "@/components/ui/logo";
import { Button } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import StaggeredMenu from "@/components/ui/StaggeredMenu";
import { site } from "@/lib/content";
import { cn } from "@/lib/utils";

const menuItems = [
  ...site.nav.map((n) => ({ label: n.label, link: n.href, ariaLabel: n.label })),
  { label: "Book a consultation", link: "/book", ariaLabel: "Book a consultation" },
];
const socialItems = site.socials.map((s) => ({ label: s.label, link: s.href }));

/**
 * `overlay` = the header sits transparent over a dark hero (home page). Only
 * after scrolling past the hero does it become the solid blur pill (and the
 * full logo collapses to the emblem). On pages with no hero it's always solid.
 */
export function Header({ overlay = false }: { overlay?: boolean }) {
  const [solid, setSolid] = useState(!overlay);

  useEffect(() => {
    if (!overlay) {
      setSolid(true);
      return;
    }
    const onScroll = () => setSolid(window.scrollY > window.innerHeight - 90);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);

  return (
    <header>
      {/* Desktop bar */}
      <div className="fixed inset-x-0 top-0 z-50 hidden md:block">
        <div className="mx-auto max-w-[1400px] px-4">
          <div
            className={cn(
              "mt-3 flex items-center justify-between rounded-full px-6 py-2.5 transition-all duration-300",
              solid
                ? "border border-hairline bg-paper/85 shadow-sm shadow-black/5 backdrop-blur-xl"
                : "border border-transparent bg-transparent",
            )}
          >
            <Link href="/" aria-label="Litch Consulting home" className="flex items-center">
              {solid ? (
                <LogoMark tone="dark" className="h-9" />
              ) : (
                <Logo tone="light" className="h-9" />
              )}
            </Link>

            <nav className="flex items-center gap-9">
              {site.nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-[13px] font-medium underline-offset-8 transition-colors hover:underline",
                    solid ? "text-body hover:text-brand" : "text-white/80 hover:text-white",
                  )}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Button href="/book" withArrow variant={solid ? "primary" : "light"}>
                Book a Consultation
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile staggered menu */}
      <div className="md:hidden">
        <StaggeredMenu
          isFixed
          position="right"
          items={menuItems}
          socialItems={socialItems}
          displaySocials
          colors={["#2540c4", "#0a196d"]}
          accentColor="#0a196d"
          menuButtonColor="#ffffff"
          openMenuButtonColor="#0a196d"
          logoUrl="/brand/litch-mark.svg"
        />
      </div>
    </header>
  );
}

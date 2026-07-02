"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, LogoMark } from "@/components/ui/logo";
import { Button } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import StaggeredMenu from "@/components/ui/StaggeredMenu";
import { site } from "@/lib/content";
import { cn } from "@/lib/utils";

const mobileItems = [
  ...site.nav.map((n) => ({ label: n.label, link: n.href, ariaLabel: n.label })),
  { label: "Log in", link: "/login", ariaLabel: "Log in" },
  { label: "Book a consultation", link: "/book", ariaLabel: "Book a consultation" },
];
const socialItems = site.socials.map((s) => ({ label: s.label, link: s.href }));

/**
 * `overlay` = the header sits transparent over a dark hero (home page). After
 * scrolling past the hero it becomes the glassy pill (and the full logo
 * collapses to the emblem). On pages with no hero it's always solid.
 */
export function Header({
  overlay = false,
  showLogin = false,
}: {
  overlay?: boolean;
  showLogin?: boolean;
}) {
  const pathname = usePathname();
  const [solid, setSolid] = useState(!overlay);

  useEffect(() => {
    if (!overlay) return; // initial state is already solid without a hero
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
                ? "border border-hairline/60 bg-paper/50 shadow-sm shadow-black/5 backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-paper/40"
                : "bg-transparent",
            )}
          >
            <Link href="/" aria-label="Litch Consulting home" className="flex items-center">
              {solid ? (
                <LogoMark tone="dark" className="h-14" />
              ) : (
                <Logo tone="light" className="h-14" />
              )}
            </Link>

            <nav className="flex items-center gap-9">
              {site.nav.map((item) => {
                const isActive =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.split("#")[0]);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "text-sm font-medium underline-offset-8 transition-colors hover:underline",
                      isActive && "underline decoration-2",
                      solid
                        ? isActive
                          ? "text-brand dark:text-white dark:decoration-white"
                          : "text-body hover:text-brand dark:text-white/80 dark:hover:text-white dark:hover:decoration-white"
                        : "text-shadow-soft " + (isActive ? "text-white" : "text-white/90 hover:text-white"),
                    )}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              {showLogin && (
                <Button href="/login" variant={solid ? "primary" : "light"}>
                  Log in
                </Button>
              )}
              <Button
                href="/book"
                withArrow
                variant={showLogin ? "outline" : solid ? "primary" : "light"}
              >
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
          solid={solid}
          position="right"
          items={mobileItems}
          socialItems={socialItems}
          displaySocials
          colors={["#2540c4", "#0a196d"]}
          accentColor="#0a196d"
          logoUrl="/brand/litch-mark.svg"
        />
      </div>
    </header>
  );
}

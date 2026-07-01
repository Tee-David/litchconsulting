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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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

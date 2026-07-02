import Image from "next/image";
import Link from "next/link";
import { Home, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared inner-page hero — a fixed-height image banner with a dark overlay,
 * text-shadowed copy, and a clean home-icon breadcrumb. Fixed height keeps every
 * non-home page hero uniform regardless of title/subtitle length.
 *
 * `breadcrumb` is an em-dash separated trail, e.g. "Home — Services — Reporting".
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  breadcrumb,
  image,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
  breadcrumb?: string;
  image: string;
}) {
  const crumbs = breadcrumb
    ? breadcrumb.split("—").map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <section
      data-hero
      className="relative flex h-[62vh] min-h-[460px] w-full items-center justify-center overflow-hidden"
    >
      <Image src={image} alt="" fill priority sizes="100vw" className="object-cover" />
      {/* Overlay: darken the image so white copy stays legible */}
      <div className="absolute inset-0 bg-gradient-to-b from-night/75 via-night/60 to-night/80" />
      <div className="absolute inset-0 bg-brand/25" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 pb-4 pt-24 text-center">
        {eyebrow && (
          <span className="text-shadow-soft text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
            {eyebrow}
          </span>
        )}
        <h1 className="text-shadow-hero mt-3 font-display text-4xl font-bold leading-[1.08] tracking-tight text-white text-balance sm:text-5xl md:text-[3.5rem]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-shadow-soft mx-auto mt-5 max-w-xl text-base text-white/85 md:text-lg">
            {subtitle}
          </p>
        )}

        {crumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="text-shadow-soft mt-6 flex items-center justify-center gap-2 text-sm text-white/70"
          >
            {crumbs.map((c, i) => {
              const isFirst = i === 0;
              const isLast = i === crumbs.length - 1;
              return (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight className="size-3.5 text-white/40" />}
                  {isFirst ? (
                    <Link href="/" aria-label="Home" className="transition-colors hover:text-white">
                      <Home className="size-4" />
                    </Link>
                  ) : isLast ? (
                    <span className="font-semibold text-white">{c}</span>
                  ) : (
                    <span>{c}</span>
                  )}
                </span>
              );
            })}
          </nav>
        )}
      </div>
    </section>
  );
}

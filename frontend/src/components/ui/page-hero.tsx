import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Shared inner-page hero — an image with a flat dark overlay (no gradients),
 * matching the home hero's treatment but shorter. The header overlays it.
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
  return (
    <section className="relative flex min-h-[58svh] w-full items-center justify-center overflow-hidden">
      <Image src={image} alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-night/70" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 pb-16 pt-28 text-center">
        {eyebrow && (
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-highlight">
            {eyebrow}
          </span>
        )}
        <h1 className="mt-3 font-display text-4xl font-bold leading-[1.08] tracking-tight text-white text-balance sm:text-5xl md:text-6xl">
          {title}
        </h1>
        {subtitle && <p className="mx-auto mt-5 max-w-xl text-base text-white/80 md:text-lg">{subtitle}</p>}
        {breadcrumb && <p className="mt-5 text-sm font-medium text-white/55">{breadcrumb}</p>}
      </div>
    </section>
  );
}

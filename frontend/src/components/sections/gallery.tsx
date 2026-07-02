"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { Eyebrow, Reveal } from "@/components/ui/primitives";
import { gallery } from "@/lib/content";

const CircularGallery = dynamic(() => import("@/components/CircularGallery"), {
  ssr: false,
});

export function Gallery() {
  const { resolvedTheme } = useTheme();
  const textColor = resolvedTheme === "dark" ? "#ffffff" : "#0a196d";
  return (
    <section className="overflow-hidden py-20 md:py-28">
      <div className="container-page">
        <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <Eyebrow>Where we add value</Eyebrow>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance sm:text-4xl">
            The full spectrum of financial expertise, in one place.
          </h2>
          <p className="text-body">
            Drag, scroll or use your arrow keys to explore the disciplines we bring to every engagement.
          </p>
        </Reveal>
      </div>

      <div className="relative mt-12 h-[440px] w-full md:h-[560px]">
        <CircularGallery
          items={gallery}
          bend={1.6}
          textColor={textColor}
          borderRadius={0.06}
          scrollEase={0.06}
          font="bold 26px Space Grotesk"
          fontUrl="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap"
          scrollSpeed={1.6}
        />
      </div>
    </section>
  );
}

import Image from "next/image";
import { Eyebrow, Reveal } from "@/components/ui/primitives";
import { builtFor } from "@/lib/content";

export function BuiltFor() {
  return (
    <section className="px-3 md:px-4">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-hero bg-night text-white">
        <div className="absolute inset-0 bg-dot-grid opacity-60" />
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-brand/40 blur-3xl" />

        <div className="relative grid gap-10 p-8 sm:p-12 md:grid-cols-2 md:gap-14 md:p-16">
          {/* Left: image */}
          <Reveal className="relative min-h-[280px] overflow-hidden rounded-xl2 md:min-h-full">
            <Image
              src="https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?auto=format&fit=crop&w=1000&q=80"
              alt="Advisors reviewing financial performance"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </Reveal>

          {/* Right: content */}
          <div className="flex flex-col justify-center">
            <Reveal>
              <Eyebrow tone="dark">{builtFor.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-balance sm:text-4xl">
                {builtFor.title}
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-4 max-w-md text-white/70">{builtFor.body}</p>
            </Reveal>

            <div className="mt-8 flex flex-col divide-y divide-white/10 border-t border-white/10">
              {builtFor.points.map((p, i) => (
                <Reveal key={p.title} delay={0.12 + i * 0.06}>
                  <div className="flex gap-4 py-5">
                    <span className="font-display text-sm font-bold text-highlight">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="font-display text-base font-semibold">{p.title}</h3>
                      <p className="mt-1 text-sm text-white/60">{p.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

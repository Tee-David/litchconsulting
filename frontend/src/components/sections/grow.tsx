import Image from "next/image";
import { TrendingUp, LineChart, ShieldCheck } from "lucide-react";
import { Section, SectionHeading, Reveal } from "@/components/ui/primitives";
import { grow } from "@/lib/content";

const icons = [TrendingUp, LineChart, ShieldCheck];

export function Grow() {
  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <SectionHeading eyebrow={grow.eyebrow} title={grow.title} body={grow.body} />
          <div className="mt-8 flex flex-col gap-3">
            {grow.cards.map((card, i) => {
              const Icon = icons[i];
              return (
                <Reveal key={card.title} delay={i * 0.07}>
                  <div className="group flex items-start gap-4 rounded-card border border-hairline bg-white p-5 transition-all hover:border-brand-soft hover:shadow-lg hover:shadow-brand/5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="font-display text-base font-bold text-ink">{card.title}</h3>
                      <p className="mt-1 text-sm text-body">{card.body}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>

        <Reveal delay={0.1}>
          <div className="relative aspect-[4/5] overflow-hidden rounded-hero">
            <Image
              src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=80"
              alt="Litch advisor with a client"
              fill
              sizes="(max-width: 1024px) 100vw, 45vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand/40 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl bg-white/90 p-4 backdrop-blur-md">
              <p className="text-sm font-semibold text-ink">&ldquo;Litch gave us the clarity we didn&rsquo;t know we needed.&rdquo;</p>
              <p className="mt-1 text-xs text-muted">David I. · Operations Director</p>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

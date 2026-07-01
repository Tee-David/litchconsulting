import { partners } from "@/lib/content";

export function Partners() {
  const row = [...partners, ...partners];
  return (
    <section className="py-14 md:py-16">
      <div className="container-page">
        <p className="mb-8 text-center text-xs font-medium uppercase tracking-[0.18em] text-muted">
          We collaborate with forward-thinking businesses
        </p>
        <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <div className="flex w-max animate-[marquee_28s_linear_infinite] items-center gap-14 pr-14">
            {row.map((name, i) => (
              <span
                key={i}
                className="font-display text-xl font-bold tracking-tight text-ink/35 transition-colors hover:text-brand"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[marquee_28s_linear_infinite\\] { animation: none; }
        }
      `}</style>
    </section>
  );
}

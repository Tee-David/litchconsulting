import { Section, SectionHeading, Reveal } from "@/components/ui/primitives";
import { process } from "@/lib/content";

export function Process() {
  return (
    <Section id="process">
      <SectionHeading eyebrow={process.eyebrow} title={process.title} align="center" />

      <div className="relative mt-14 grid gap-6 md:grid-cols-4">
        {/* connecting line */}
        <div className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-brand-soft to-transparent md:block" />
        {process.steps.map((step, i) => (
          <Reveal key={step.no} delay={i * 0.08}>
            <div className="relative flex flex-col items-start">
              <span className="relative z-10 grid size-14 place-items-center rounded-2xl bg-brand font-display text-lg font-bold text-white shadow-lg shadow-brand/20">
                {step.no}
              </span>
              <h3 className="mt-5 font-display text-lg font-bold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-body">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

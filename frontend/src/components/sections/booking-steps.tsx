import { CalendarClock, ClipboardList, Video } from "lucide-react";
import { Reveal } from "@/components/ui/primitives";
import { bookingSteps } from "@/lib/content";

const icons = [CalendarClock, ClipboardList, Video];

export function BookingSteps() {
  return (
    <section className="container-page py-6">
      <div className="grid gap-8 md:grid-cols-[1fr_1.1fr] md:items-end">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
            {bookingSteps.eyebrow}
          </span>
          <h2 className="mt-3 font-display text-[1.9rem] font-bold leading-tight tracking-tight text-pretty sm:text-4xl">
            {bookingSteps.title}
          </h2>
        </div>
        <p className="text-body md:pb-1">{bookingSteps.body}</p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {bookingSteps.steps.map((step, i) => {
          const Icon = icons[i];
          return (
            <Reveal key={step.no} delay={i * 0.08}>
              <div className="flex h-full flex-col gap-4 rounded-card border border-hairline bg-surface p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand text-white">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-display text-2xl font-bold text-brand/20">{step.no}</span>
                </div>
                <h3 className="font-display text-lg font-bold text-ink">{step.title}</h3>
                <p className="text-sm leading-relaxed text-body">{step.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

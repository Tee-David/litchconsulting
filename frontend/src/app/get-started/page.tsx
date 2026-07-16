import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, CalendarClock, Clock, MessagesSquare } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section, SectionHeading, Button } from "@/components/ui/primitives";
import { getCatalog } from "@/lib/services/catalog";
import { formatMoney } from "@/lib/invoice/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "Request a service with guided steps and secure online payment, or book a free consultation with Litch Consulting.",
};

/**
 * The funnel chooser the header CTA lands on: Request a Service first
 * (with public pricing), Book a Free Consultation second.
 */
export default async function GetStartedPage() {
  const catalog = await getCatalog().catch(() => []);

  return (
    <>
      <Header />
      <main className="flex-1">
        <Section className="pt-32">
          <SectionHeading
            eyebrow="Get started"
            title="Tell us what you need — we'll handle the rest."
            body="Pick a service to start right away with guided steps and secure payment, or talk to us first — the consultation is free."
            align="center"
          />

          {/* Request a service */}
          <div className="mt-14">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-ink">Request a service</h2>
                <p className="mt-1 text-sm text-body">
                  Guided steps · pay securely online · track progress in your dashboard.
                </p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {catalog.map((s) => (
                <Link
                  key={s.slug}
                  href={`/request/${s.slug}`}
                  className="group flex flex-col overflow-hidden rounded-card border border-hairline bg-paper shadow-sm shadow-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/5"
                >
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <Image
                      src={s.image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="absolute right-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-xs font-bold text-brand shadow-sm backdrop-blur">
                      {s.pricingMode === "fixed" && s.priceNgn
                        ? `From ${formatMoney(Number(s.priceNgn))}`
                        : "Custom quote"}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-base font-bold text-ink">{s.name}</h3>
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                        <ArrowUpRight className="size-4" />
                      </span>
                    </div>
                    <p className="mt-1.5 flex-1 text-sm leading-relaxed text-body">{s.tagline}</p>
                    {s.turnaround && (
                      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                        <Clock className="size-3.5" /> Typically {s.turnaround}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Book a consultation */}
          <div className="mt-14 overflow-hidden rounded-card border border-hairline bg-paper">
            <div className="grid items-center gap-8 p-8 sm:p-10 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-brand-tint text-brand">
                    <MessagesSquare className="size-5" />
                  </span>
                  <h2 className="font-display text-xl font-bold text-ink">
                    Not sure where to start? Book a free consultation.
                  </h2>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-body">
                  A 30-minute call with our team — no sign-up needed, no obligation. We&apos;ll listen,
                  point you in the right direction, and tell you honestly what you do (and don&apos;t)
                  need.
                </p>
              </div>
              <Button href="/book" withArrow>
                <CalendarClock className="mr-1 size-4" /> Book a consultation
              </Button>
            </div>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { BookingSteps } from "@/components/sections/booking-steps";
import { BookingForm } from "@/components/sections/booking-form";

export const metadata: Metadata = {
  title: "Book a Consultation",
  description:
    "Book a free 30-minute consultation with Litch Consulting. Pick a date and time, share a few details, and meet your advisor over Google Meet or phone.",
};

export default function BookPage() {
  return (
    <>
      <Header />
      <main className="flex-1 pt-28 md:pt-32">
        {/* Intro */}
        <section className="container-page pb-4 pt-4 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
            Book a consultation
          </span>
          <h1 className="mx-auto mt-3 max-w-3xl font-display text-[2.2rem] font-bold leading-[1.08] tracking-tight text-pretty sm:text-5xl sm:text-balance">
            Let&rsquo;s talk about your numbers.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-body">
            A free, no-obligation call to understand your goals and show how Litch can help across
            reporting, modelling, taxation and advisory.
          </p>
        </section>

        <BookingSteps />

        <section className="container-page py-12 md:py-16">
          <BookingForm />
        </section>
      </main>
      <Footer />
    </>
  );
}

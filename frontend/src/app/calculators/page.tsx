import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow } from "@/components/ui/primitives";
import { CalculatorsExplorer } from "@/components/calculators/calculators-explorer";

export const metadata: Metadata = {
  title: "Nigerian Financial Calculators | Litch Consulting",
  description:
    "Free, accurate Nigerian finance calculators — 2026 PAYE/income tax, salary & net pay, pension, VAT, loan, mortgage and import duty. Built on the Nigeria Tax Act 2025.",
  alternates: { canonical: "/calculators" },
};

export default function CalculatorsPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="container-page pb-20 pt-28 md:pt-36">
          <div className="mb-8 max-w-2xl">
            <Eyebrow>Free tools</Eyebrow>
            <h1 className="mt-3 font-display text-[2.2rem] font-bold leading-[1.1] tracking-tight text-ink sm:text-4xl md:text-5xl">
              Nigerian financial calculators
            </h1>
            <p className="mt-4 text-base leading-relaxed text-body">
              Accurate estimates for the 2026 tax year — income tax and take-home pay, pension, VAT,
              loans, mortgages and import duty, all built on the current Nigeria Tax Act.
            </p>
          </div>
          <CalculatorsExplorer />
        </section>
      </main>
      <Footer />
    </>
  );
}

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/sections/hero";
import { Partners } from "@/components/sections/partners";
import { ValueCards } from "@/components/sections/value-cards";
import { BuiltFor } from "@/components/sections/built-for";
import { Solutions } from "@/components/sections/solutions";
import { Impact } from "@/components/sections/impact";
import { Stats } from "@/components/sections/stats";
import { Process } from "@/components/sections/process";
import { Grow } from "@/components/sections/grow";
import { ScrollHighlight } from "@/components/sections/scroll-highlight";
import { Audiences } from "@/components/sections/audiences";
import { Gallery } from "@/components/sections/gallery";
import { Testimonials } from "@/components/sections/testimonials";
import { CaseStudies } from "@/components/sections/case-studies";
import { Insights } from "@/components/sections/insights";
import { Faq } from "@/components/sections/faq";
import { Contact } from "@/components/sections/contact";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <Partners />
        <ValueCards />
        <BuiltFor />
        <Solutions />
        <Impact />
        <Stats />
        <Process />
        <Grow />
        <ScrollHighlight />
        <Audiences />
        <Gallery />
        <Testimonials />
        <CaseStudies />
        <Insights />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

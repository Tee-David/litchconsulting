import { Phone, Mail, MapPin } from "lucide-react";
import { Eyebrow, Button } from "@/components/ui/primitives";
import { site, cta } from "@/lib/content";

export function Contact() {
  return (
    <section id="contact" className="px-3 py-20 md:px-4 md:py-28">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-hero bg-brand px-6 py-14 text-white sm:px-10 md:px-16 md:py-20">
        <div className="absolute -right-20 -top-20 size-80 rounded-full bg-highlight/25 blur-3xl" />
        <div className="absolute inset-0 bg-dot-grid opacity-40" />

        <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <Eyebrow tone="dark">Get started</Eyebrow>
            <h2 className="mt-5 font-display text-[1.9rem] font-bold leading-tight tracking-tight text-pretty sm:text-4xl sm:text-balance md:text-[2.75rem]">
              {cta.title}
            </h2>
            <p className="mt-4 max-w-lg text-white/75">{cta.body}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/book" variant="light" withArrow className="w-full bg-white text-brand hover:bg-white/90 sm:w-auto">
                Book a Consultation
              </Button>
              <Button href={`mailto:${site.email}`} variant="light" withArrow className="w-full sm:w-auto">
                Email us
              </Button>
            </div>
          </div>

          <ul className="flex flex-col gap-4 lg:border-l lg:border-white/15 lg:pl-10">
            <li>
              <a href={`tel:${site.phoneHref}`} className="flex items-center gap-3 text-white/90 hover:text-white">
                <span className="grid size-10 place-items-center rounded-full bg-white/10">
                  <Phone className="size-4" />
                </span>
                {site.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${site.email}`} className="flex items-center gap-3 text-white/90 hover:text-white">
                <span className="grid size-10 place-items-center rounded-full bg-white/10">
                  <Mail className="size-4" />
                </span>
                <span className="break-all">{site.email}</span>
              </a>
            </li>
            <li className="flex items-center gap-3 text-white/90">
              <span className="grid size-10 place-items-center rounded-full bg-white/10">
                <MapPin className="size-4" />
              </span>
              {site.location}
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

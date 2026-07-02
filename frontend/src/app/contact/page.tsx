import type { Metadata } from "next";
import { Mail, Phone, MapPin, MessageCircle } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section } from "@/components/ui/primitives";
import { PageHero } from "@/components/ui/page-hero";
import { ContactForm } from "@/components/sections/contact-form";
import { site, contactPage, services } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description: contactPage.intro,
};

export default function ContactPage() {
  const whatsapp = `https://wa.me/${site.phoneHref.replace(/[^0-9]/g, "")}`;
  return (
    <>
      <Header overlay />
      <main className="flex-1">
        <PageHero
          eyebrow={contactPage.eyebrow}
          title={contactPage.title}
          subtitle={contactPage.intro}
          breadcrumb="Home — Contact"
          image={services[0].image}
        />

        <Section>
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            {/* Details */}
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
                Get in touch
              </h2>
              <p className="mt-3 text-body">
                Prefer to talk it through? Reach us directly, or send a message and we&rsquo;ll come back to you quickly.
              </p>

              <ul className="mt-8 space-y-5">
                <li className="flex items-start gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                    <Mail className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">Email</p>
                    <a href={`mailto:${site.email}`} className="text-body hover:text-brand">
                      {site.email}
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                    <Phone className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">Phone</p>
                    <a href={`tel:${site.phoneHref}`} className="text-body hover:text-brand">
                      {site.phone}
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                    <MessageCircle className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">WhatsApp</p>
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="text-body hover:text-brand">
                      Chat with us
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                    <MapPin className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">Location</p>
                    <p className="text-body">{site.location}</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Form */}
            <ContactForm />
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}

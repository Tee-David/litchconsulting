import type { Metadata } from "next";
import { Mail, Phone, MapPin, MessageCircle, ArrowUpRight } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PageHero } from "@/components/ui/page-hero";
import { ContactForm } from "@/components/sections/contact-form";
import { site, contactPage, services } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description: contactPage.intro,
};

export default function ContactPage() {
  const whatsapp = `https://wa.me/${site.phoneHref.replace(/[^0-9]/g, "")}`;

  const details = [
    { icon: Mail, label: "Email", value: site.email, href: `mailto:${site.email}` },
    { icon: Phone, label: "Phone", value: site.phone, href: `tel:${site.phoneHref}` },
    { icon: MessageCircle, label: "WhatsApp", value: "Chat with us", href: whatsapp, external: true },
    { icon: MapPin, label: "Location", value: site.location },
  ];

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

        <section className="container-page relative z-10 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            {/* Details */}
            <div className="order-2 lg:order-1">
              <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Get in touch</h2>
              <p className="mt-3 max-w-md text-body">
                Prefer to talk it through? Reach us directly, or send a message and we&rsquo;ll come back to you quickly.
              </p>

              <ul className="mt-8 space-y-5">
                {details.map(({ icon: Icon, label, value, href, external }) => (
                  <li key={label} className="flex items-start gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{label}</p>
                      {href ? (
                        <a
                          href={href}
                          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          className="group inline-flex items-center gap-1 text-body transition-colors hover:text-[#ffffff]"
                        >
                          {value}
                          <ArrowUpRight className="size-4 text-brand transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </a>
                      ) : (
                        <p className="inline-flex items-center gap-1 text-body">
                          {value}
                          <ArrowUpRight className="size-4 text-brand" />
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Form */}
            <div className="relative z-20 order-1 lg:order-2">
              <div className="rounded-card shadow-2xl shadow-black/10">
                <ContactForm />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

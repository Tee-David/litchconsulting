import { site, services } from "@/lib/content";

/**
 * Schema.org structured data (JSON-LD) for the public site. Builders return
 * plain objects; <JsonLd> renders them. Only facts the page itself shows go in
 * here (search engines penalise markup that disagrees with the page).
 */

export const SITE_URL = "https://www.litchconsulting.com";
const abs = (path: string) => (path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`);
const ORG_ID = `${SITE_URL}/#organization`;

type Thing = Record<string, unknown>;

const realSocials = () => site.socials.map((s) => s.href).filter((h) => h.startsWith("http"));

/** The firm, as a ProfessionalService (a LocalBusiness + Organization). */
export function organizationLd(): Thing {
  return {
    "@context": "https://schema.org",
    "@type": ["ProfessionalService", "Organization"],
    "@id": ORG_ID,
    name: site.legalName,
    alternateName: site.name,
    description: site.description,
    slogan: site.tagline,
    url: SITE_URL,
    logo: abs("/brand/litch-logo.svg"),
    image: abs("/brand/email-logo-navy.png"),
    email: site.email,
    telephone: site.phone,
    address: { "@type": "PostalAddress", addressLocality: "Lagos", addressCountry: "NG" },
    areaServed: { "@type": "Country", name: "Nigeria" },
    knowsAbout: services.map((s) => s.name),
    sameAs: realSocials(),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Services",
      itemListElement: services.map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s.name, url: abs(`/services/${s.slug}`) },
      })),
    },
  };
}

export function websiteLd(): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: site.name,
    publisher: { "@id": ORG_ID },
  };
}

export function serviceLd(s: { slug: string; name: string; overview: string; image?: string; kind?: string }): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": abs(`/services/${s.slug}#service`),
    name: s.name,
    serviceType: s.kind ?? s.name,
    description: s.overview,
    url: abs(`/services/${s.slug}`),
    ...(s.image ? { image: s.image } : {}),
    provider: { "@id": ORG_ID },
    areaServed: { "@type": "Country", name: "Nigeria" },
  };
}

export function faqLd(faqs: ReadonlyArray<{ q: string; a: string }>): Thing | null {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function articleLd(p: { slug: string; title: string; excerpt: string; image: string; date: string; author: string; section?: string; modified?: string }): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": abs(`/insights/${p.slug}#article`),
    headline: p.title.slice(0, 110),
    description: p.excerpt,
    image: [p.image],
    datePublished: p.date,
    dateModified: p.modified ?? p.date,
    author: { "@type": p.author === site.name || p.author === site.legalName ? "Organization" : "Person", name: p.author },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: abs(`/insights/${p.slug}`),
    ...(p.section ? { articleSection: p.section } : {}),
  };
}

export function caseStudyLd(c: { slug: string; title: string; body: string; image: string }): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": abs(`/case-studies/${c.slug}#article`),
    headline: c.title.slice(0, 110),
    description: c.body,
    image: [c.image],
    articleSection: "Case study",
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: abs(`/case-studies/${c.slug}`),
  };
}

/** Breadcrumbs: pass the trail after Home, e.g. [["Services", "/services"], ["Tax", "/services/tax"]]. */
export function breadcrumbLd(trail: Array<[name: string, path: string]>): Thing {
  const items: Array<[string, string]> = [["Home", "/"], ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(path) })),
  };
}

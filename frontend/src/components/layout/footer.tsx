"use client";

import { useState, type SVGProps } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { site, legal } from "@/lib/content";
import { newsletterSchema } from "@/lib/schemas";

/* Inline brand glyphs (lucide in this project doesn't export these). */
function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2Zm0 1.8a8.08 8.08 0 0 1 5.73 2.37 8.05 8.05 0 0 1 2.37 5.73c0 4.47-3.64 8.1-8.11 8.1-1.47 0-2.9-.39-4.15-1.13l-.3-.18-3.12.82.83-3.04-.19-.31a8.05 8.05 0 0 1-1.24-4.29c0-4.47 3.64-8.1 8.11-8.1Zm4.65 11.35c-.25-.13-1.5-.74-1.73-.82-.23-.09-.4-.13-.57.13-.17.25-.65.82-.8.99-.15.17-.29.19-.54.06-.25-.13-1.07-.39-2.04-1.26-.75-.67-1.26-1.5-1.41-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.57-1.38-.79-1.88-.2-.49-.41-.42-.57-.43l-.48-.01c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.5-.61 1.71-1.2.21-.59.21-1.1.15-1.2-.06-.11-.23-.17-.48-.29Z" />
    </svg>
  );
}
function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm7 0h3.83v1.64h.05c.53-1 1.84-2.06 3.79-2.06 4.05 0 4.8 2.67 4.8 6.14V21h-4v-5.5c0-1.31-.02-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9V21h-4V9Z" />
    </svg>
  );
}
function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const SOCIAL_ICON: Record<string, (p: SVGProps<SVGSVGElement>) => React.ReactElement> = {
  WhatsApp: WhatsAppIcon,
  LinkedIn: LinkedInIcon,
  Instagram: InstagramIcon,
};

const quickLinks = [
  ...legal.map((d) => ({ label: d.title, href: `/legal/${d.slug}` })),
  { label: "Forgot Password", href: "/forgot-password" },
  { label: "Sign Up", href: "/signup" },
];

export function Footer() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const parsed = newsletterSchema.safeParse({ email });
    if (!parsed.success) {
      setError("Enter a valid email");
      return;
    }
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) throw new Error();
      setDone(true);
      setEmail("");
    } catch {
      setError("Something went wrong. Try again.");
    }
  };

  const linkCls =
    "text-sm text-body transition-colors hover:text-brand dark:text-white/70 dark:hover:text-white";
  const headCls = "font-display text-sm font-semibold text-ink dark:text-white";

  return (
    <footer className="px-3 pb-3 md:px-4 md:pb-4">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-hero border border-hairline bg-paper px-6 pt-14 text-ink dark:border-transparent dark:bg-brand dark:text-white sm:px-10 md:px-14">
        <div className="relative z-10 grid gap-12 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {/* Newsletter */}
          <div>
            <Logo className="h-8" />
            <h3 className="mt-6 max-w-xs font-display text-lg font-semibold text-ink dark:text-white">
              Join our newsletter for financial insights, monthly.
            </h3>
            {done ? (
              <p className="mt-5 flex items-center gap-2 text-sm text-brand dark:text-white">
                <Check className="size-4" /> You&rsquo;re subscribed.
              </p>
            ) : (
              <form onSubmit={subscribe} className="mt-5 max-w-sm">
                <div className="flex items-center gap-2 rounded-full border border-hairline bg-surface p-1.5 pl-4 dark:border-white/20 dark:bg-white/10">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted dark:text-white dark:placeholder:text-white/50"
                  />
                  <button
                    type="submit"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover dark:bg-white dark:text-brand dark:hover:bg-white/90"
                  >
                    Subscribe <ArrowRight className="size-4" />
                  </button>
                </div>
                {error && <p className="mt-2 text-xs text-red-500 dark:text-red-300">{error}</p>}
              </form>
            )}
            <div className="mt-6 flex gap-2">
              {site.socials.map((s) => {
                const Icon = SOCIAL_ICON[s.label] ?? WhatsAppIcon;
                return (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="grid size-9 place-items-center rounded-full border border-hairline text-body transition-colors hover:border-brand hover:bg-brand/5 hover:text-brand dark:border-white/25 dark:text-white dark:hover:border-white dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <Icon className="size-4" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className={headCls}>Company</h4>
            <ul className="mt-4 flex flex-col gap-2.5">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className={linkCls}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick links */}
          <div>
            <h4 className={headCls}>Quick links</h4>
            <ul className="mt-4 flex flex-col gap-2.5">
              {quickLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkCls}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Get in touch */}
          <div>
            <h4 className={headCls}>Get in touch</h4>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm text-body dark:text-white/70">
              <li>
                <a href={`tel:${site.phoneHref}`} className="hover:text-brand dark:hover:text-white">
                  {site.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${site.email}`} className="break-all hover:text-brand dark:hover:text-white">
                  {site.email}
                </a>
              </li>
              <li>{site.location}</li>
            </ul>
          </div>
        </div>

        {/* Giant background wordmark */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-[-0.08em] select-none [container-type:inline-size]"
          aria-hidden
        >
          <span className="relative block text-center font-display text-[38cqw] font-bold leading-[0.72] tracking-tighter text-ink/[0.07] dark:text-white/[0.10]">
            Litch
            <span className="align-top text-[0.12em] text-brand/30 dark:text-highlight/40">®</span>
          </span>
        </div>

        {/* Copyright */}
        <div className="relative z-10 mt-32 flex flex-col items-center justify-between gap-3 py-6 text-sm text-body dark:text-white/60 md:mt-44 md:flex-row">
          <p>
            © {new Date().getFullYear()} {site.legalName}. All rights reserved.
          </p>
          <p>Clarity · Compliance · Confidence</p>
        </div>
      </div>
    </footer>
  );
}

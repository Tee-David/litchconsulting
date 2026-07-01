"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { site } from "@/lib/content";
import { newsletterSchema } from "@/lib/schemas";

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

  return (
    <footer className="px-3 pb-3 md:px-4 md:pb-4">
      <div className="mx-auto max-w-[1400px] overflow-hidden rounded-hero bg-ink px-6 pt-14 text-white sm:px-10 md:px-14">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr_1fr]">
          {/* Newsletter */}
          <div>
            <h3 className="max-w-xs font-display text-lg font-semibold">
              Join our newsletter for financial insights, monthly.
            </h3>
            {done ? (
              <p className="mt-5 flex items-center gap-2 text-sm text-highlight">
                <Check className="size-4" /> You&rsquo;re subscribed.
              </p>
            ) : (
              <form onSubmit={subscribe} className="mt-5 max-w-sm">
                <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 p-1.5 pl-4">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                  />
                  <button
                    type="submit"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
                  >
                    Subscribe <ArrowRight className="size-4" />
                  </button>
                </div>
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              </form>
            )}
            <div className="mt-6 flex gap-2">
              {site.socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="grid size-9 place-items-center rounded-full border border-white/15 text-xs text-white/70 transition-colors hover:bg-white/10"
                >
                  {s.label[0]}
                </a>
              ))}
            </div>
          </div>

          {/* Sitemap */}
          <div>
            <h4 className="font-display text-sm font-semibold text-white/90">Company</h4>
            <ul className="mt-4 flex flex-col gap-2.5">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="text-sm text-white/60 hover:text-white">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display text-sm font-semibold text-white/90">Get in touch</h4>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm text-white/60">
              <li>
                <a href={`tel:${site.phoneHref}`} className="hover:text-white">{site.phone}</a>
              </li>
              <li>
                <a href={`mailto:${site.email}`} className="break-all hover:text-white">{site.email}</a>
              </li>
              <li>{site.location}</li>
            </ul>
          </div>
        </div>

        {/* Giant wordmark */}
        <div className="relative mt-10 select-none">
          <span className="block text-center font-display font-bold leading-[0.8] tracking-tighter text-white/[0.07] text-[clamp(5rem,26vw,22rem)]">
            Litch
            <sup className="align-super text-brand text-[0.2em]">®</sup>
          </span>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-6 text-sm text-white/50 md:flex-row">
          <p>
            © {new Date().getFullYear()} {site.legalName}. All rights reserved.
          </p>
          <p>Clarity · Compliance · Confidence</p>
        </div>
      </div>
    </footer>
  );
}

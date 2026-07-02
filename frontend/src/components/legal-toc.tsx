"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function LegalToc({
  sections,
  others,
}: {
  sections: { id: string; heading: string }[];
  others: { slug: string; title: string }[];
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!els.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: [0, 1] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  return (
    <nav className="lg:sticky lg:top-28 lg:self-start" aria-label="Sections">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand dark:text-highlight">
        On this page
      </p>
      <ul className="mt-4 space-y-2.5">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cn(
                "text-sm transition-colors",
                active === s.id ? "font-semibold text-brand" : "text-body hover:text-brand",
              )}
            >
              {s.heading}
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap gap-2">
        {others.map((d) => (
          <Link
            key={d.slug}
            href={`/legal/${d.slug}`}
            className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-body transition-colors hover:border-brand hover:text-brand"
          >
            {d.title}
          </Link>
        ))}
      </div>
    </nav>
  );
}

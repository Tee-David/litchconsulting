"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { onOpenConsentSettings, openConsentSettings, saveConsent, useConsent } from "@/lib/consent";
import { cn } from "@/lib/utils";

/**
 * Cookie notice (NDPA). Shown until the visitor chooses; re-opened from
 * "Cookie settings" in the footer. Strictly necessary cookies are always on;
 * the only optional category is the Cal.com booking calendar.
 */
export function ConsentBanner() {
  const consent = useConsent();
  const [mounted, setMounted] = useState(false);
  const [forced, setForced] = useState(false);
  const [embeds, setEmbeds] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(
    () =>
      onOpenConsentSettings(() => {
        setForced(true);
        setTimeout(() => ref.current?.focus(), 30);
      }),
    [],
  );
  useEffect(() => {
    setEmbeds(Boolean(consent?.embeds));
  }, [consent]);

  if (!mounted) return null;
  const open = forced || !consent;
  if (!open) return null;

  function choose(allowEmbeds: boolean) {
    saveConsent(allowEmbeds);
    setForced(false);
  }

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-card border border-hairline bg-paper p-4 shadow-2xl outline-none sm:inset-x-auto sm:right-5 sm:bottom-5 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-ctl bg-brand-tint text-accent">
          <Cookie className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-2">
          <h2 id="consent-title" className="font-display text-[15px] font-semibold text-ink">
            Cookies on this site
          </h2>
          <p className="text-[13.5px] leading-relaxed text-body">
            We only use cookies needed to run the site: signing in, security, and remembering your theme. No analytics or advertising trackers. The booking calendar comes from
            Cal.com and sets its own cookies, so it loads only if you allow it.{" "}
            <Link href="/legal/cookie-policy" className="font-medium text-accent hover:underline">
              Cookie policy
            </Link>
          </p>
          {forced ? (
            <label className="flex items-center gap-2 pt-1 text-sm text-ink">
              <input type="checkbox" checked={embeds} onChange={(e) => setEmbeds(e.target.checked)} className="size-4 accent-[var(--color-act)]" />
              Allow the Cal.com booking calendar
            </label>
          ) : null}
        </div>
      </div>
      <div className={cn("mt-4 flex flex-wrap justify-end gap-2")}>
        {forced ? (
          <button
            type="button"
            onClick={() => choose(embeds)}
            className="keep-brand inline-flex h-10 items-center rounded-ctl bg-act px-4 text-sm font-semibold text-act-ink hover:bg-act-hover"
          >
            Save choice
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => choose(false)}
              className="inline-flex h-10 items-center rounded-ctl border border-line-strong bg-paper px-4 text-sm font-medium text-ink hover:bg-surface"
            >
              Necessary only
            </button>
            <button
              type="button"
              onClick={() => choose(true)}
              className="keep-brand inline-flex h-10 items-center rounded-ctl bg-act px-4 text-sm font-semibold text-act-ink hover:bg-act-hover"
            >
              Allow booking calendar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Footer link that re-opens the panel. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        openConsentSettings();
      }}
      className={className}
    >
      Cookie settings
    </button>
  );
}

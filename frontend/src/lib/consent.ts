"use client";

import { useSyncExternalStore } from "react";

/**
 * Cookie consent (NDPA 2023). The site sets only strictly necessary cookies by
 * default: the sign-in session, two-step and security cookies, and the theme
 * and table preferences you choose. There are no analytics or advertising
 * trackers. The one optional category is third-party embeds: the Cal.com
 * booking calendar, which loads Cal.com's own scripts and cookies, so it only
 * loads after you allow it.
 *
 * The choice is stored in a first-party cookie (`litch_consent`, 12 months)
 * and can be changed any time from "Cookie settings" in the footer.
 */

export const CONSENT_COOKIE = "litch_consent";
export const CONSENT_VERSION = 1;
const MAX_AGE = 60 * 60 * 24 * 365;
const OPEN_EVENT = "litch:consent-open";
const CHANGE_EVENT = "litch:consent-change";

export type Consent = { v: number; embeds: boolean; at: string };

function read(): Consent | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Consent;
    return parsed.v === CONSENT_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

let cached: Consent | null | undefined;
let cachedRaw: string | undefined;

function snapshot(): Consent | null {
  const raw = typeof document === "undefined" ? "" : document.cookie;
  if (raw !== cachedRaw || cached === undefined) {
    cachedRaw = raw;
    cached = read();
  }
  return cached;
}

export function saveConsent(embeds: boolean) {
  const value: Consent = { v: CONSENT_VERSION, embeds, at: new Date().toISOString() };
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(value))}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

/** The stored choice, or null when the visitor has not chosen yet. */
export function useConsent(): Consent | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** Open the cookie settings panel (footer link, booking placeholder). */
export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenConsentSettings(cb: () => void) {
  window.addEventListener(OPEN_EVENT, cb);
  return () => window.removeEventListener(OPEN_EVENT, cb);
}

"use client";

/**
 * Stepper draft carried across the signup wall in localStorage. Deliberately
 * cheap: if it's lost the visitor rebuilds it in under a minute, so there is
 * no server-side draft table. Drafts expire after 24h so a stale service
 * pick never resurfaces weeks later.
 */
export type RequestDraft = {
  serviceSlug: string;
  details: string;
  intake: { timeline?: string; companySize?: string };
  savedAt: number;
};

const KEY = "litch:request-draft";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function saveRequestDraft(draft: Omit<RequestDraft, "savedAt">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // storage unavailable (private mode) — the portal stepper starts fresh
  }
}

export function loadRequestDraft(): RequestDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as RequestDraft;
    if (!draft?.serviceSlug || Date.now() - (draft.savedAt ?? 0) > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearRequestDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

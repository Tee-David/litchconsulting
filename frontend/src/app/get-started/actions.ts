"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { rateLimit, callerKey } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getCatalog } from "@/lib/services/catalog";
import { isDisposableEmail } from "@/lib/block-disposable-email";
import { createDraft, isDraftId, openDraft, updateDraft } from "./draft";

/*
 * Public writes for /get-started and sign-up (R1.6). Rate-limited per caller
 * and behind Turnstile (skipped when no Turnstile key is configured), because
 * these are the two forms a bot would fill.
 */

type Res = { ok: true; draftId: string } | { ok: false; error: string };

const RULE = { limit: 20, windowSeconds: 3600 };
const PRIVACY_NOTICE_VERSION = "privacy-ndpa-2023";

async function guard(scope: string, turnstileToken: unknown): Promise<string | null> {
  const h = await headers();
  const limited = await rateLimit(callerKey(h, scope), RULE);
  if (!limited.ok) return "Too many tries from this connection. Wait a little and try again.";
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ts = await verifyTurnstile(turnstileToken, ip);
  if (!ts.ok) return ts.error;
  return null;
}

const chooseSchema = z.object({
  serviceSlug: z.string().min(1).max(80),
  details: z.string().max(4000).optional(),
  draftId: z.string().optional(),
  turnstileToken: z.string().optional(),
});

/** Save the chosen service as a server-side draft; returns its id for the sign-up link. */
export async function chooseServiceAction(input: z.infer<typeof chooseSchema>): Promise<Res> {
  const parsed = chooseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a service to continue." };
  const blocked = await guard("get-started", parsed.data.turnstileToken);
  if (blocked) return { ok: false, error: blocked };
  const catalog = await getCatalog().catch(() => []);
  const svc = catalog.find((s) => s.slug === parsed.data.serviceSlug);
  if (!svc) return { ok: false, error: "That service is not available right now. Choose another." };
  const details = parsed.data.details?.trim() || undefined;
  try {
    if (parsed.data.draftId && isDraftId(parsed.data.draftId)) {
      const updated = await updateDraft(parsed.data.draftId, { serviceSlug: svc.slug, answers: details ? { details } : {} });
      if (updated) return { ok: true, draftId: updated.id };
    }
    const row = await createDraft({ serviceSlug: svc.slug, answers: details ? { details } : {} });
    return { ok: true, draftId: row.id };
  } catch (err) {
    console.error("[get-started] draft save failed:", err);
    return { ok: false, error: "We could not save your choice just now. Try again in a moment." };
  }
}

const signupSchema = z.object({
  email: z.string().email().max(200),
  company: z.string().max(160).optional(),
  draftId: z.string().optional(),
  turnstileToken: z.string().optional(),
});

/**
 * Before the account is created: remember the email and company on the draft
 * (making one when there is none), so both survive verification on another
 * device. The draft id then goes into the verification link.
 */
export async function prepareSignupAction(input: z.infer<typeof signupSchema>): Promise<Res> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  if (isDisposableEmail(parsed.data.email)) return { ok: false, error: "Use a permanent email address; we send your quotes and files there." };
  const blocked = await guard("signup-prepare", parsed.data.turnstileToken);
  if (blocked) return { ok: false, error: blocked };
  const company = parsed.data.company?.trim() || undefined;
  // NDPA consent: when, and which version of the notice they agreed to.
  const consent = { consentAt: new Date().toISOString(), consentVersion: PRIVACY_NOTICE_VERSION };
  try {
    if (parsed.data.draftId && (await openDraft(parsed.data.draftId))) {
      const updated = await updateDraft(parsed.data.draftId, { email: parsed.data.email, answers: { ...(company ? { company } : {}), ...consent } });
      if (updated) return { ok: true, draftId: updated.id };
    }
    const row = await createDraft({ serviceSlug: null, email: parsed.data.email, answers: { ...(company ? { company } : {}), ...consent } });
    return { ok: true, draftId: row.id };
  } catch (err) {
    console.error("[signup] prepare failed:", err);
    return { ok: false, error: "We could not start your sign-up just now. Try again in a moment." };
  }
}

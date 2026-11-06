import { NextResponse, after } from "next/server";
import { newsletterSchema } from "@/lib/schemas";
import { site } from "@/lib/content";
import { db } from "@/lib/db/client";
import { lead } from "@/lib/db/schema";
import { sendTemplate } from "@/lib/email-templates";
import { rateLimit, RATE_LIMITS, callerKey, callerIp, tooManyRequests } from "@/lib/rate-limit";
import { verifyTurnstile, turnstileTokenFrom } from "@/lib/turnstile";

export async function POST(req: Request) {
  const limited = await rateLimit(callerKey(req.headers, "newsletter"), RATE_LIMITS.newsletter);
  if (!limited.ok) return tooManyRequests(limited);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const human = await verifyTurnstile(turnstileTokenFrom(body), callerIp(req.headers), "open"); // fail open: honeypot + rate limit stay
  if (!human.ok) return NextResponse.json({ error: human.error }, { status: 403 });

  const parsed = newsletterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 422 });
  }
  const { email } = parsed.data;

  try {
    await db.insert(lead).values({ email, source: "newsletter" });
  } catch (err) {
    console.error("[newsletter] lead insert failed:", err);
  }

  after(() =>
    sendTemplate(
      "notice",
      {
        subject: "New newsletter subscriber",
        heading: "New newsletter subscriber",
        paragraphs: [`**${email}** subscribed to the newsletter.`],
        why: "You got this because someone subscribed on litchconsulting.com.",
      },
      { to: process.env.CONTACT_TO_EMAIL || site.email, audience: "admin", dedupeKey: `newsletter:${email.toLowerCase()}` },
    ).catch((err) => console.error("[newsletter] email send failed:", err)),
  );

  return NextResponse.json({ ok: true, delivered: true });
}

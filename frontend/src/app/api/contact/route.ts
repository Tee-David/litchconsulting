import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/schemas";
import { site } from "@/lib/content";
import { db } from "@/lib/db/client";
import { lead } from "@/lib/db/schema";
import { sendTemplate } from "@/lib/email-templates";
import { rateLimit, RATE_LIMITS, callerKey, callerIp, tooManyRequests } from "@/lib/rate-limit";
import { verifyTurnstile, turnstileTokenFrom } from "@/lib/turnstile";

export async function POST(req: Request) {
  const limited = await rateLimit(callerKey(req.headers, "contact"), RATE_LIMITS.contact);
  if (!limited.ok) return tooManyRequests(limited);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const human = await verifyTurnstile(turnstileTokenFrom(body), callerIp(req.headers), "open"); // fail open: honeypot + rate limit stay
  if (!human.ok) return NextResponse.json({ error: human.error }, { status: 403 });

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const data = parsed.data;

  // The lead is the record of truth — persist first, email is best-effort.
  try {
    await db.insert(lead).values({
      email: data.email,
      name: data.name,
      source: "booking",
      detail: `${data.service}${data.company ? ` · ${data.company}` : ""} — ${data.message}`.slice(
        0,
        2000
      ),
    });
  } catch (err) {
    console.error("[contact] lead insert failed:", err);
  }

  const to = process.env.CONTACT_TO_EMAIL || site.email;
  const result = await sendTemplate(
    "notice",
    {
      subject: `New consultation request: ${data.service}`,
      heading: "New consultation request",
      paragraphs: [`**${data.name}** (${data.email}) asked for a consultation.`, data.message],
      rows: [
        { label: "Service", value: data.service, strong: true },
        { label: "Company", value: data.company || "Not given" },
      ],
      note: "Reply to this email to answer them directly.",
      why: "You got this because someone sent the contact form on litchconsulting.com.",
    },
    { to, replyTo: data.email, audience: "admin" },
  ).catch((err) => {
    console.error("[contact] email send failed:", err);
    return { delivered: false as const };
  });

  return NextResponse.json({ ok: true, delivered: Boolean(result?.delivered ?? true) });
}

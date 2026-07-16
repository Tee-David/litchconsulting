import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/schemas";
import { site } from "@/lib/content";
import { db } from "@/lib/db/client";
import { lead } from "@/lib/db/schema";
import { sendEmail, emailLayout } from "@/lib/email";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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
  const result = await sendEmail({
    to,
    replyTo: data.email,
    subject: `New consultation request — ${data.service}`,
    html: emailLayout(`
      <p style="margin:0 0 14px;"><strong>${data.name}</strong> (${data.email}) requested a consultation.</p>
      <table style="border-collapse:collapse;font-size:14px;color:#3c4657;">
        <tr><td style="padding:4px 12px 4px 0;color:#5b6474;">Service</td><td style="padding:4px 0;"><strong>${data.service}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5b6474;">Company</td><td style="padding:4px 0;">${data.company || "—"}</td></tr>
      </table>
      <p style="margin:16px 0 0;padding:12px 16px;background:#f3f5fb;border-radius:12px;">${data.message}</p>
    `),
  }).catch((err) => {
    console.error("[contact] email send failed:", err);
    return { delivered: false as const };
  });

  return NextResponse.json({ ok: true, delivered: Boolean(result?.delivered ?? true) });
}

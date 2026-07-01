import { NextResponse } from "next/server";
import { Resend } from "resend";
import { contactSchema } from "@/lib/schemas";
import { site } from "@/lib/content";

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
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL || site.email;

  // Gracefully degrade when no email provider is configured (e.g. local dev).
  if (!apiKey) {
    console.info("[contact] RESEND_API_KEY not set — logging submission instead:", data);
    return NextResponse.json({ ok: true, delivered: false });
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.CONTACT_FROM_EMAIL || "Litch Website <onboarding@resend.dev>",
      to,
      replyTo: data.email,
      subject: `New consultation request — ${data.service}`,
      text: [
        `Name: ${data.name}`,
        `Email: ${data.email}`,
        `Company: ${data.company || "—"}`,
        `Service: ${data.service}`,
        "",
        data.message,
      ].join("\n"),
    });
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("[contact] email send failed:", err);
    return NextResponse.json({ error: "Failed to send" }, { status: 502 });
  }
}

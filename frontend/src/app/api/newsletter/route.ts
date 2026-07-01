import { NextResponse } from "next/server";
import { Resend } from "resend";
import { newsletterSchema } from "@/lib/schemas";
import { site } from "@/lib/content";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = newsletterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 422 });
  }
  const { email } = parsed.data;
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL || site.email;

  if (!apiKey) {
    console.info("[newsletter] RESEND_API_KEY not set — logging subscriber instead:", email);
    return NextResponse.json({ ok: true, delivered: false });
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.CONTACT_FROM_EMAIL || "Litch Website <onboarding@resend.dev>",
      to,
      subject: "New newsletter subscriber",
      text: `New subscriber: ${email}`,
    });
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("[newsletter] email send failed:", err);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 502 });
  }
}

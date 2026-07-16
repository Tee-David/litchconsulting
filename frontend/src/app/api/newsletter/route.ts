import { NextResponse } from "next/server";
import { newsletterSchema } from "@/lib/schemas";
import { site } from "@/lib/content";
import { db } from "@/lib/db/client";
import { lead } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

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

  try {
    await db.insert(lead).values({ email, source: "newsletter" });
  } catch (err) {
    console.error("[newsletter] lead insert failed:", err);
  }

  void sendEmail({
    to: process.env.CONTACT_TO_EMAIL || site.email,
    subject: "New newsletter subscriber",
    html: `<p>New subscriber: <strong>${email}</strong></p>`,
  }).catch((err) => console.error("[newsletter] email send failed:", err));

  return NextResponse.json({ ok: true, delivered: true });
}

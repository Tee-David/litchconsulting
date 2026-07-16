import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { consultation, client, lead } from "@/lib/db/schema";
import { notifyAdmin } from "@/lib/notify";
import { formatDateTime } from "@/lib/format-date";

export const dynamic = "force-dynamic";

/**
 * Cal.com webhook — mirrors bookings into the `consultation` table (the
 * booking uid is the idempotency key; reschedules/cancellations update in
 * place) and records a lead for new bookings. Signature: x-cal-signature-256
 * = HMAC-SHA256 of the raw body with the webhook secret.
 */

type CalAttendee = { email?: string; name?: string };
type CalPayload = {
  uid?: string;
  bookingId?: number;
  title?: string;
  startTime?: string;
  endTime?: string;
  attendees?: CalAttendee[];
  responses?: Record<string, { label?: string; value?: unknown }>;
  metadata?: { videoCallUrl?: string } | null;
  status?: string;
};
type CalEvent = { triggerEvent?: string; payload?: CalPayload };

function isValidSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!isValidSignature(raw, req.headers.get("x-cal-signature-256"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: CalEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const p = event.payload ?? {};
  const uid = p.uid;
  const attendee = p.attendees?.[0];
  if (!uid || !attendee?.email) return NextResponse.json({ ok: true });

  try {
    switch (event.triggerEvent) {
      case "BOOKING_CREATED":
      case "BOOKING_RESCHEDULED": {
        const rescheduled = event.triggerEvent === "BOOKING_RESCHEDULED";
        // Match a known client by email so the admin sees who booked.
        const [known] = await db
          .select({ id: client.id })
          .from(client)
          .where(eq(client.email, attendee.email));

        await db
          .insert(consultation)
          .values({
            calBookingUid: uid,
            name: attendee.name ?? null,
            email: attendee.email,
            clientId: known?.id ?? null,
            startsAt: p.startTime ? new Date(p.startTime) : null,
            endsAt: p.endTime ? new Date(p.endTime) : null,
            status: rescheduled ? "rescheduled" : "confirmed",
            meetingUrl: p.metadata?.videoCallUrl ?? null,
            notes: p.responses ?? null,
          })
          .onConflictDoUpdate({
            target: consultation.calBookingUid,
            set: {
              startsAt: p.startTime ? new Date(p.startTime) : null,
              endsAt: p.endTime ? new Date(p.endTime) : null,
              status: rescheduled ? "rescheduled" : "confirmed",
              meetingUrl: p.metadata?.videoCallUrl ?? null,
              notes: p.responses ?? null,
              updatedAt: new Date(),
            },
          });

        if (!rescheduled) {
          try {
            await db.insert(lead).values({
              email: attendee.email,
              name: attendee.name ?? null,
              source: "booking",
              detail: `Consultation ${p.startTime ? formatDateTime(p.startTime) : "(time TBC)"} — ${p.title ?? "booking"}`,
            });
          } catch (err) {
            console.error("[calcom] lead insert failed:", err);
          }
        }

        await notifyAdmin({
          subject: rescheduled
            ? `Consultation rescheduled — ${attendee.name ?? attendee.email}`
            : `New consultation booked — ${attendee.name ?? attendee.email}`,
          html: `<p><strong>${attendee.name ?? attendee.email}</strong> ${
            rescheduled ? "moved their consultation to" : "booked a consultation for"
          } <strong>${p.startTime ? formatDateTime(p.startTime) : "a time TBC"}</strong>.</p>`,
          href: `${(process.env.BETTER_AUTH_URL || "https://litchconsulting.com").replace(/\/$/, "")}/admin/requests?tab=consultations`,
        });
        break;
      }
      case "BOOKING_CANCELLED": {
        await db
          .update(consultation)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(consultation.calBookingUid, uid));
        await notifyAdmin({
          subject: `Consultation cancelled — ${attendee.name ?? attendee.email}`,
          html: `<p><strong>${attendee.name ?? attendee.email}</strong> cancelled their consultation${
            p.startTime ? ` (${formatDateTime(p.startTime)})` : ""
          }.</p>`,
        });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[calcom] webhook handler error:", err);
  }

  return NextResponse.json({ ok: true });
}

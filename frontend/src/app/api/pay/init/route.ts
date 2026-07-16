import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice, serviceRequest } from "@/lib/db/schema";
import { initInvoicePayment } from "@/lib/payments/init";

export const dynamic = "force-dynamic";

/**
 * Public payment init for /i/[token]. Possession of the unguessable public
 * token IS the authorization (same trust model as the page itself) — the
 * payer may not have an account.
 */
export async function POST(req: Request) {
  let token: unknown;
  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  if (typeof token !== "string" || token.length < 10) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const [inv] = await db.select().from(invoice).where(eq(invoice.publicToken, token));
  if (!inv) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const [req_] = await db
    .select({ id: serviceRequest.id })
    .from(serviceRequest)
    .where(eq(serviceRequest.invoiceId, inv.id));

  const result = await initInvoicePayment(inv, { requestId: req_?.id ?? null });
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

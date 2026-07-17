import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { uploadPrivateObject, r2PrivateConfigured } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * DATABASE BACKUP — daily (Vercel Cron, see vercel.json) + on-demand from
 * admin Settings → Backups.
 *
 * Design choice: JSON snapshot export (not `BACKUP INTO`).
 * CockroachDB Serverless does not permit user-driven `BACKUP … INTO 's3://…'`
 * to an arbitrary external location from an ordinary SQL connection (it's a
 * cluster-level / enterprise operation, and this app runs against the shared
 * serverless tier through a stateless Vercel function). So instead of the
 * enterprise BACKUP statement we take a portable, restore-anywhere logical
 * snapshot: SELECT every key business table → one JSON document →
 * uploadPrivateObject into the PRIVATE R2 bucket under
 *   backups/db/<yyyy>/<yyyy-mm-dd>-<ts>.json
 * The Better Auth-owned `user`/`session`/`account` tables and heavy
 * append-only logs are intentionally excluded — this captures the recoverable
 * business state (clients, invoicing, requests, payments, CMS, settings).
 */

const BACKUP_TABLES = [
  "client",
  "invoice",
  "invoice_item",
  "service_offering",
  "service_request",
  "service_request_event",
  "service_request_document",
  "payment",
  "consultation",
  "ticket",
  "ticket_message",
  "template",
  "post",
  "expense",
  "org_settings",
  "client_note",
  "lead",
] as const;

export type BackupResult = {
  key: string;
  bytes: number;
  tables: Record<string, number>;
  generatedAt: string;
};

/** Run one logical snapshot and store it in the private R2 bucket. */
export async function runDatabaseBackup(): Promise<BackupResult> {
  if (!r2PrivateConfigured) {
    throw new Error("Private R2 bucket is not configured — cannot store backups.");
  }

  const snapshot: Record<string, unknown[]> = {};
  const tables: Record<string, number> = {};

  for (const t of BACKUP_TABLES) {
    try {
      const res = await db.execute(sql.raw(`SELECT * FROM "${t}"`));
      const rows = (res as unknown as { rows: unknown[] }).rows ?? [];
      snapshot[t] = rows;
      tables[t] = rows.length;
    } catch (err) {
      // A table that doesn't exist yet on this environment shouldn't abort the
      // whole backup — record it as empty and carry on.
      snapshot[t] = [];
      tables[t] = 0;
      console.warn(`[backup] skipped "${t}":`, err instanceof Error ? err.message : err);
    }
  }

  const now = new Date();
  const generatedAt = now.toISOString();
  const doc = JSON.stringify({ generatedAt, tables, snapshot });
  const buf = Buffer.from(doc, "utf8");

  const yyyy = now.getUTCFullYear();
  const day = generatedAt.slice(0, 10); // yyyy-mm-dd
  const key = `backups/db/${yyyy}/${day}-${now.getTime()}.json`;

  await uploadPrivateObject(key, buf, "application/json");

  return { key, bytes: buf.length, tables, generatedAt };
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDatabaseBackup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[backup] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "backup failed" },
      { status: 500 }
    );
  }
}

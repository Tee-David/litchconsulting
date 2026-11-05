"use server";

import { revalidatePath } from "next/cache";
import { Pool } from "pg";
import { recordAudit } from "@/lib/audit";
import { actor, DENIED } from "../../_lib/guard";

/*
 * "Run restore test" — the same drill as scripts/restore-backup.ts, server
 * side: load the newest JSON snapshot from the private bucket, build a FRESH
 * scratch database with the real schema (apply-schema STATEMENTS), insert
 * every table, compare row counts with the snapshot, then drop the scratch
 * database. It never writes to the production database. The result is kept
 * in the audit log (backup.restore_test) so the Backups page can show it.
 */

// Parent tables first (matches the backup order and the CLI drill).
const ORDER = [
  "client", "invoice", "invoice_item", "service_offering", "service_request",
  "service_request_event", "service_request_document", "payment", "consultation",
  "ticket", "ticket_message", "template", "post", "expense", "org_settings",
  "client_note", "lead",
];

export type RestoreTableResult = { table: string; snapshot: number; restored: number; pass: boolean };
export type RestoreResult =
  | { ok: true; pass: boolean; key: string; takenAt: string; tables: RestoreTableResult[]; seconds: number }
  | { ok: false; error: string };

const quote = (t: string) => `"${t.replace(/"/g, "")}"`;

export async function runRestoreTestAction(): Promise<RestoreResult> {
  const me = await actor("settings");
  if (!me) return DENIED;
  const baseUrl = process.env.COCKROACHDB_URL || process.env.DATABASE_URL;
  if (!baseUrl) return { ok: false, error: "The database URL is not set on this deployment." };
  const started = Date.now();
  let key = "";
  try {
    const { listPrivateObjects, getPrivateObject, r2PrivateConfigured } = await import("@/lib/r2");
    if (!r2PrivateConfigured) return { ok: false, error: "The private backup bucket is not configured, so there is nothing to restore." };
    const objects = (await listPrivateObjects("backups/db/")).filter((o) => o.key.endsWith(".json"));
    if (!objects.length) return { ok: false, error: "No backups yet. Run Back up now first." };
    key = objects.sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""))[0].key;
    const doc = JSON.parse((await getPrivateObject(key)).toString("utf8")) as {
      generatedAt: string;
      tables: Record<string, number>;
      snapshot: Record<string, unknown[]>;
    };

    const { STATEMENTS, ssl } = await import("../../../../../scripts/apply-schema");
    const scratch = `litch_restore_${Date.now()}`;
    const url = new URL(baseUrl);
    const admin = new Pool({ connectionString: baseUrl, ssl: ssl(), max: 1 });
    const results: RestoreTableResult[] = [];
    try {
      await admin.query(`CREATE DATABASE ${quote(scratch)}`);
      url.pathname = `/${scratch}`;
      const pool = new Pool({ connectionString: url.toString(), ssl: ssl(), max: 1 });
      try {
        for (const stmt of STATEMENTS) await pool.query(stmt);
        const tables = [...ORDER, ...Object.keys(doc.snapshot).filter((t) => !ORDER.includes(t))];
        for (const t of tables) {
          if (!/^[a-z_]+$/.test(t)) continue;
          const rows = doc.snapshot[t] ?? [];
          if (rows.length) await pool.query(`INSERT INTO ${quote(t)} SELECT * FROM json_populate_recordset(NULL::${quote(t)}, $1::json)`, [JSON.stringify(rows)]);
          const { rows: c } = await pool.query(`SELECT count(*)::int AS n FROM ${quote(t)}`);
          const want = doc.tables[t] ?? rows.length;
          const got = Number(c[0].n);
          results.push({ table: t, snapshot: want, restored: got, pass: got === want });
        }
      } finally {
        await pool.end();
      }
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${quote(scratch)} CASCADE`).catch(() => undefined);
      await admin.end();
    }
    const pass = results.every((r) => r.pass);
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    await recordAudit({
      action: "backup.restore_test",
      entity: "backup",
      entityId: key,
      meta: { pass, seconds, takenAt: doc.generatedAt, tables: results.length, failed: results.filter((r) => !r.pass).map((r) => r.table) },
    });
    revalidatePath("/admin/settings/backups");
    return { ok: true, pass, key, takenAt: doc.generatedAt, tables: results, seconds };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordAudit({ action: "backup.restore_test", entity: "backup", entityId: key || null, meta: { pass: false, error: msg.slice(0, 200) } });
    revalidatePath("/admin/settings/backups");
    return {
      ok: false,
      error: /permission|privilege/i.test(msg)
        ? "The database user cannot create a scratch database here. Run the drill from a terminal: node --env-file=.env.local --import tsx scripts/restore-backup.ts"
        : `The restore test failed: ${msg.slice(0, 160)}`,
    };
  }
}

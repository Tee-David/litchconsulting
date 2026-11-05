import { NextResponse } from "next/server";
import { runDatabaseBackup } from "@/lib/backup/db-backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily DB snapshot to private R2 (Vercel Cron); logic in lib/backup/db-backup.ts. */
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

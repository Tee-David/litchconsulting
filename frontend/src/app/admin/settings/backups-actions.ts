"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/server-user";
import { presignPrivateGet } from "@/lib/r2";
import { recordAudit } from "@/lib/audit";
import { runDatabaseBackup } from "@/app/api/cron/backup/route";

type ActionResult = { ok: boolean; error?: string };

/** On-demand "Back up now" — same routine the daily cron runs. */
export async function runBackupNowAction(): Promise<ActionResult & { key?: string; bytes?: number }> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  try {
    const result = await runDatabaseBackup();
    await recordAudit({
      action: "backup.created",
      entity: "backup",
      entityId: result.key,
      meta: { bytes: result.bytes, tables: result.tables },
    });
    revalidatePath("/admin/settings");
    return { ok: true, key: result.key, bytes: result.bytes };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Backup failed" };
  }
}

/** Mint a short-lived presigned download URL for a stored backup object. */
export async function getBackupDownloadUrlAction(
  key: string
): Promise<ActionResult & { url?: string }> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!key.startsWith("backups/")) return { ok: false, error: "Invalid backup key." };
  try {
    const url = await presignPrivateGet(key, {
      downloadName: key.split("/").pop() || "backup.json",
      expiresIn: 120,
    });
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create download link" };
  }
}

import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { listPrivateObjects, r2PrivateConfigured } from "@/lib/r2";
import { BackupsCard, type BackupItem } from "../backups-card";
import { RestoreTestCard, type LastRestore } from "@/components/admin/settings/restore-test-card";

export const dynamic = "force-dynamic";
// The restore test runs as a server action on this page and needs the time.
export const maxDuration = 60;

export default async function BackupsPage() {
  const [objects, [lastTest]] = await Promise.all([
    r2PrivateConfigured ? listPrivateObjects("backups/db/").catch(() => []) : Promise.resolve([]),
    db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "backup"), eq(auditLog.action, "backup.restore_test")))
      .orderBy(desc(auditLog.createdAt))
      .limit(1),
  ]);
  const backups: BackupItem[] = [...objects]
    .sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""))
    .slice(0, 20)
    .map((o) => ({ key: o.key, size: o.size, lastModified: o.lastModified }));
  const meta = (lastTest?.meta ?? {}) as { pass?: boolean; seconds?: number; error?: string; failed?: string[] };
  const last: LastRestore = lastTest
    ? { at: lastTest.createdAt.toISOString(), pass: Boolean(meta.pass), seconds: meta.seconds, error: meta.error, failed: meta.failed }
    : null;

  return (
    <div className="space-y-5">
      <BackupsCard backups={backups} configured={r2PrivateConfigured} />
      <RestoreTestCard last={last} enabled={r2PrivateConfigured && backups.length > 0} />
      <section className="rounded-card border border-hairline bg-paper p-4 text-sm text-body sm:p-5">
        <h2 className="mb-1 font-display text-[15px] font-semibold text-ink">Analysis server (LitchAI) backups</h2>
        <p>
          The analysis server backs up its own database, uploads and models nightly to the private bucket (see the runbook in backend/deploy). Its health shows in{" "}
          <Link href="/admin/settings/integrations" className="font-medium text-accent hover:underline">
            Integrations
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { and, isNull } from "drizzle-orm";
import { requireArea } from "@/lib/server-user";
import { SageWorkspace } from "@/components/sage/workspace";
import { db } from "@/lib/db/client";
import { client } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Sage" };
export const dynamic = "force-dynamic";

/**
 * Sage for admins: answers with sources; writes come back as a plan to
 * confirm. Full-bleed under the topbar (and above the phone bar).
 */
export default async function SagePage() {
  await requireArea("sage", "/admin/sage");
  const clients = await db
    .select({ id: client.id, name: client.name, company: client.company })
    .from(client)
    .where(and(isNull(client.deletedAt), isNull(client.erasedAt)));

  return (
    <SageWorkspace
      role="admin"
      basePath="/admin/sage"
      online={Boolean(process.env.LITCHAI_API_URL)}
      clients={clients}
      frameClassName="-mx-4 -mb-24 -mt-5 h-[calc(100dvh-62px-56px-env(safe-area-inset-bottom))] sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mb-10 lg:h-[calc(100dvh-62px)]"
    />
  );
}

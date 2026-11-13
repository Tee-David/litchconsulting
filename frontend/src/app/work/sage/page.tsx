import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/server-user";
import { SageWorkspace } from "@/components/sage/workspace";

export const metadata: Metadata = { title: "Sage" };
export const dynamic = "force-dynamic";

/**
 * Sage for staff. Scope comes from the session on every call: only the
 * requests assigned to this person, no amounts, no writes. Admins use
 * /admin/sage (the whole firm).
 */
export default async function StaffSagePage() {
  const user = await requireArea("sage", "/work/sage");
  if (user.role === "admin") redirect("/admin/sage");

  return (
    <SageWorkspace
      role="staff"
      basePath="/work/sage"
      online={Boolean(process.env.LITCHAI_API_URL)}
      frameClassName="-mx-4 -mb-28 -mt-6 h-[calc(100dvh-64px-64px-env(safe-area-inset-bottom))] sm:-mx-6 lg:-mx-8 lg:-mb-12 lg:h-[calc(100dvh-64px)]"
    />
  );
}

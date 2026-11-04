import { requireArea } from "@/lib/server-user";

export const dynamic = "force-dynamic";

/** Billing is admin-only money; staff never see amounts (access map: billing). */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  await requireArea("billing", "/admin/billing");
  return <>{children}</>;
}

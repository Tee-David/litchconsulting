import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

/**
 * Server-side role gate. The edge middleware only checks session presence;
 * here we enforce that the user is actually an admin (else bounce to the
 * client portal).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/admin");
  if (user.role !== "admin") redirect("/dashboard");

  return <div className="min-h-screen bg-cloud">{children}</div>;
}

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";
import { AdminShell } from "@/components/admin/admin-shell";
import { recentNotifications } from "@/lib/db/queries/notifications";

export const dynamic = "force-dynamic";

/**
 * Server-side role gate. The edge middleware only checks session presence;
 * here we enforce that the user is actually an admin (else bounce to the
 * client portal), then render the admin shell.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/admin");
  if (user.role !== "admin") redirect("/dashboard");

  const notifications = await recentNotifications();

  return (
    <AdminShell
      user={{ name: user.name, email: user.email, image: user.image, role: user.role }}
      notifications={notifications}
    >
      {children}
    </AdminShell>
  );
}

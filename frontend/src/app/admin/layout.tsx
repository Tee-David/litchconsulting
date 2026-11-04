import { redirect } from "next/navigation";
import { requireArea } from "@/lib/server-user";
import { homeFor } from "@/lib/access";
import { AdminShell } from "@/components/admin/admin-shell";
import { navCounts } from "./_lib/nav-counts";

export const dynamic = "force-dynamic";

/**
 * Server-side role gate for the firm workspace. The edge proxy only checks
 * that a session exists; here signed-out users go to /login, and anyone who
 * is not an admin goes to their own home (staff → /work, clients →
 * /dashboard). Each page and every server action re-checks its own area.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireArea("home", "/admin");
  if (user.role !== "admin") redirect(homeFor(user.role));

  const counts = await navCounts();

  return (
    <AdminShell
      user={{ name: user.name, email: user.email, image: user.image, role: user.role }}
      counts={counts}
      sageOnline={Boolean(process.env.LITCHAI_API_URL)}
    >
      {children}
    </AdminShell>
  );
}

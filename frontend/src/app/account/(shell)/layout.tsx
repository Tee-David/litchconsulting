import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";
import { roleOf, ROLE_LABEL } from "@/lib/access";
import { AdminShell } from "@/components/admin/admin-shell";
import { ClientFrame, StaffFrame } from "@/components/dashboard/client-frame";
import { navCounts } from "@/app/admin/_lib/nav-counts";
import { staffAttention } from "@/lib/attention/staff";
import { staffThreads } from "@/lib/requests/work";
import { clientAttention } from "@/lib/attention/client";
import { getPortal } from "@/lib/requests/portal";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Profile and security inside the person's own workspace (admin, staff or
 * client shell), with the same badges as there. A firm account still held at
 * two-step counts as signed out here and goes back to the two-step page.
 */
export default async function AccountShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/account/two-step");
  const role = roleOf(user);

  if (role === "admin") {
    const counts = await navCounts();
    return (
      <AdminShell user={{ name: user.name, email: user.email, image: user.image, role: user.role }} counts={counts} sageOnline={Boolean(process.env.LITCHAI_API_URL)}>
        {children}
      </AdminShell>
    );
  }
  if (role === "staff") {
    const [attention, unread, threads] = await Promise.all([
      staffAttention(user.id).catch(() => []),
      unreadCount(user.id).catch(() => 0),
      staffThreads(user.id).catch(() => []),
    ]);
    return (
      <StaffFrame
        user={{ name: user.name, email: user.email, sub: ROLE_LABEL[role] }}
        counts={{ attention: attention.length, unread, threads: threads.filter((t) => t.unanswered > 0).length }}
        preview={false}
      >
        {children}
      </StaffFrame>
    );
  }
  const portal = await getPortal().catch(() => null);
  const [attention, unread] = await Promise.all([
    portal ? clientAttention(portal.client.id).catch(() => []) : Promise.resolve([]),
    unreadCount(user.id).catch(() => 0),
  ]);
  return (
    <ClientFrame user={{ name: user.name, email: user.email, sub: portal?.client.company || "Client" }} counts={{ attention: attention.length, unread }}>
      {children}
    </ClientFrame>
  );
}

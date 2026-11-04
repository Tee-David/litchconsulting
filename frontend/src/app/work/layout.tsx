import { requireArea } from "@/lib/server-user";
import { staffAttention } from "@/lib/attention/staff";
import { staffThreads } from "@/lib/requests/work";
import { unreadCount } from "@/lib/notifications";
import { ROLE_LABEL } from "@/lib/access";
import { StaffFrame } from "@/components/dashboard/client-frame";

export const dynamic = "force-dynamic";

/**
 * Staff workspace. requireArea("home") admits staff and admins (admins see it
 * as a preview of their own assignments); clients are sent to /dashboard.
 */
export default async function WorkLayout({ children }: { children: React.ReactNode }) {
  const user = await requireArea("home", "/work");
  const [attention, unread, threads] = await Promise.all([
    staffAttention(user.id).catch(() => []),
    unreadCount(user.id).catch(() => 0),
    staffThreads(user.id).catch(() => []),
  ]);
  return (
    <StaffFrame
      user={{ name: user.name, email: user.email, sub: ROLE_LABEL[user.role] }}
      counts={{ attention: attention.length, unread, threads: threads.filter((t) => t.unanswered > 0).length }}
      preview={user.role === "admin"}
    >
      {children}
    </StaffFrame>
  );
}

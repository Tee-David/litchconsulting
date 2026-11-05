import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, CheckCircle2, Clock } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthHeading } from "@/components/auth/ui";
import { CATEGORIES, getPrefs, setPref, type NotifyCategory } from "@/lib/notifications";
import { verifyUnsubscribe } from "@/lib/email-templates";
import { recordAudit } from "@/lib/audit";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * One-click "stop this kind of email" (R6.1). The link in the email footer is
 * signed (HMAC of user + category), so it works without signing in and only
 * for that person and that category. Showing a confirm button (a POST) rather
 * than acting on the GET keeps mail scanners that pre-open links from
 * unsubscribing people by accident. The bell keeps the history either way.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; c?: string; s?: string; done?: string }> }) {
  const { u = "", c = "", s = "", done } = await searchParams;
  const valid = c in CATEGORIES && verifyUnsubscribe(u, c, s);
  const label = valid ? CATEGORIES[c as NotifyCategory].label : "";

  async function stop() {
    "use server";
    if (!(c in CATEGORIES) || !verifyUnsubscribe(u, c, s)) return;
    const prefs = await getPrefs(u);
    const cur = prefs.find((p) => p.category === c);
    await setPref(u, { category: c as NotifyCategory, mode: cur?.mode ?? "immediate", email: false, push: cur?.push ?? true });
    await recordAudit({ action: "notification.unsubscribed", entity: "user", entityId: u, actorId: u, actorName: "email link", meta: { category: c } });
    const { redirect } = await import("next/navigation");
    redirect(`/unsubscribe?u=${encodeURIComponent(u)}&c=${encodeURIComponent(c)}&s=${encodeURIComponent(s)}&done=1`);
  }

  return (
    <AuthShell>
      {!valid ? (
        <>
          <AuthHeading icon={<Clock />} tone="warn" title="This link is not valid" lede="It may have been copied only in part. Sign in and change your email settings under Notifications." />
          <Link href="/login" className="text-sm font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      ) : done ? (
        <>
          <AuthHeading
            icon={<CheckCircle2 />}
            tone="good"
            title={`No more “${label}” emails`}
            lede="You still see these in the bell when you sign in. Security and payment emails always send."
          />
          <Link href="/login" className="text-sm font-medium text-accent hover:underline">
            Sign in to change more settings
          </Link>
        </>
      ) : (
        <form action={stop} className="flex flex-col gap-5">
          <AuthHeading icon={<BellOff />} title={`Stop “${label}” emails?`} lede={`${CATEGORIES[c as NotifyCategory].hint} You will still see them in the bell when you sign in.`} />
          <button type="submit" className="keep-brand inline-flex h-11 items-center justify-center rounded-ctl bg-act px-4 text-[15px] font-semibold text-act-ink hover:bg-act-hover">
            Stop these emails
          </button>
          <Link href="/login" className="text-sm font-medium text-accent hover:underline">
            Sign in to choose in more detail
          </Link>
        </form>
      )}
    </AuthShell>
  );
}

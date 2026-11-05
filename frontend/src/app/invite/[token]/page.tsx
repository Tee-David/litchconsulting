import type { Metadata } from "next";
import Link from "next/link";
import { Ban, CheckCircle2, Clock, Link2Off } from "lucide-react";
import { AuthShell, ClientSide, StaffSide } from "@/components/auth/auth-shell";
import { AuthHeading } from "@/components/auth/ui";
import { InviteAcceptForm } from "@/components/auth/invite-accept-form";
import { invitationForToken, COLLEAGUE_ACCESS, type ColleagueAccess } from "@/lib/invitations";
import { getAuthSession } from "@/lib/server-user";
import { REASON } from "./accept-lib";

export const metadata: Metadata = { title: "Your invitation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /invite/[token] (R1.2). One page, five states: valid (set up the account),
 * expired, already used, withdrawn, and a link we don't recognise. Nothing is
 * created until the form is submitted.
 */
export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string | string[] }> }) {
  const { token } = await params;
  const raw = (await searchParams).error;
  // Better Auth appends its own ?error= to the error callback, so it can repeat.
  const error = Array.isArray(raw) ? raw[0] : raw;
  const inv = await invitationForToken(token).catch(() => null);
  const inviter = inv?.inviterName || inv?.inviterEmail || "Litch Consulting";
  const firm = inv && inv.role !== "client";
  const side = firm ? <StaffSide /> : <ClientSide />;

  if (!inv) {
    return (
      <AuthShell side={side}>
        <AuthHeading icon={<Link2Off />} tone="warn" title="We don't recognise this link" lede="It may have been copied only in part, or replaced by a newer invitation. Open the latest invitation email, or ask whoever invited you to send it again." />
        <Link href="/login" className="text-sm font-medium text-accent hover:underline">
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  if (inv.state === "redeemed") {
    const s = await getAuthSession();
    return (
      <AuthShell side={side}>
        <AuthHeading icon={<CheckCircle2 />} tone="good" title="This invitation was already accepted" lede={`The account for ${inv.email} is set up. Sign in to continue.`} />
        <Link href={s?.user ? "/account/continue" : "/login"} className="keep-brand inline-flex h-11 items-center justify-center rounded-ctl bg-act px-4 text-[15px] font-semibold text-act-ink hover:bg-act-hover">
          {s?.user ? "Continue" : "Sign in"}
        </Link>
      </AuthShell>
    );
  }

  if (inv.state === "expired" || inv.state === "revoked") {
    const expired = inv.state === "expired";
    return (
      <AuthShell side={side}>
        <AuthHeading
          icon={expired ? <Clock /> : <Ban />}
          tone="warn"
          title={expired ? "This invitation has expired" : "This invitation was withdrawn"}
          lede={
            expired
              ? `Invitations work for 7 days. Ask ${inviter} to send a new one; it takes them a click.`
              : `${inviter} withdrew it, or sent a newer one. Check your inbox for the latest invitation, or ask them.`
          }
        />
        {inv.inviterEmail ? (
          <a href={`mailto:${inv.inviterEmail}?subject=${encodeURIComponent("New Litch invitation, please")}`} className="text-sm font-medium text-accent hover:underline">
            Email {inviter}
          </a>
        ) : null}
      </AuthShell>
    );
  }

  const access = inv.access && inv.access in COLLEAGUE_ACCESS ? COLLEAGUE_ACCESS[inv.access as ColleagueAccess] : null;
  const roleText = inv.role === "admin" ? "Admin" : inv.role === "staff" ? "Staff" : access?.label ?? "Client contact";
  return (
    <AuthShell side={side}>
      <InviteAcceptForm
        token={token}
        email={inv.email}
        inviter={inviter}
        roleText={roleText}
        roleHint={inv.role === "admin" ? "Billing, settings, the team and every request." : inv.role === "staff" ? "The requests assigned to you, their files and client messages." : access?.hint ?? null}
        company={inv.role === "client" ? inv.company : null}
        message={inv.message}
        expiresAt={inv.expiresAt.toISOString()}
        firm={Boolean(firm)}
        googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
        initialError={
          error === "mismatch" || error === "google"
            ? `This invitation is for ${inv.email}. Sign in with that Google account, or use a password.`
            : error && error in REASON
              ? REASON[error as keyof typeof REASON]
              : null
        }
      />
    </AuthShell>
  );
}

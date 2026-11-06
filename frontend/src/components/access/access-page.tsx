"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Send, ShieldAlert, ShieldCheck, UserPlus, X } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { Panel } from "@/components/admin/ui/surface";
import { Button, ConfirmSheet, EmptyState, Segmented, Sheet, StatusChip } from "@/components/kit";
import { Field } from "@/components/auth/ui";
import {
  changeTeamRoleAction,
  inviteTeamMemberAction,
  resendInvitationAction,
  resetTwoStepAction,
  revokeInvitationAction,
  signOutEverywhereAction,
} from "@/app/admin/settings/access/actions";
import { cn } from "@/lib/utils";
import { accessMatrix } from "@/lib/access";
import { Check, Minus } from "lucide-react";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  banned: boolean;
  twoStep: boolean;
  lastActive: string | null;
  devices: number;
  open: number;
  me: boolean;
};
export type InviteRow = {
  id: string;
  email: string;
  role: string;
  company: string | null;
  access: string | null;
  state: "pending" | "redeemed" | "revoked" | "expired";
  inviterName: string | null;
  sentAt: string;
  expiresAt: string;
};
export type AssignmentRow = {
  userId: string;
  name: string;
  role: "admin" | "staff";
  requests: Array<{ id: string; number: string; service: string; status: string; client: string; updatedAt: string }>;
};

const ago = (iso: string | null) => {
  if (!iso) return "Not signed in";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 5) return "Active now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};
const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(new Date(iso));

const INVITE_STATE: Record<InviteRow["state"], { label: string; cls: string }> = {
  pending: { label: "Waiting", cls: "bg-info-soft text-info" },
  expired: { label: "Expired", cls: "bg-warn-soft text-warn" },
  revoked: { label: "Withdrawn", cls: "bg-surface text-muted" },
  redeemed: { label: "Accepted", cls: "bg-good-soft text-good" },
};

type Confirm = { kind: "reset" | "signout" | "revoke" | "role"; id: string; label: string; role?: "admin" | "staff" } | null;

/**
 * Settings → Team and access (R1.3). Rendered inside the Settings layout, so
 * no page title of its own. Tabs: the team (roles, two-step, devices) with its
 * invitations, and who is working on what.
 */
export function AccessPage({ team, invites, work, unassigned, openInvite, tab: initialTab }: { team: TeamRow[]; invites: InviteRow[]; work: AssignmentRow[]; unassigned: number; openInvite: boolean; tab: "team" | "assign" | "roles" }) {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<"team" | "assign" | "roles">(initialTab);
  const [inviteOpen, setInviteOpen] = useState(openInvite);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, start] = useTransition();
  const admins = team.filter((t) => t.role === "admin" && !t.banned).length;
  const missing2fa = team.filter((t) => !t.twoStep && !t.banned).length;
  const waiting = invites.filter((i) => i.state === "pending");

  function quick(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Done.");
      else toast.error(r.error ?? "That did not work.");
      router.refresh();
    });
  }

  async function confirmed() {
    if (!confirm) return;
    const r =
      confirm.kind === "reset"
        ? await resetTwoStepAction(confirm.id)
        : confirm.kind === "signout"
          ? await signOutEverywhereAction(confirm.id)
          : confirm.kind === "revoke"
            ? await revokeInvitationAction(confirm.id)
            : await changeTeamRoleAction(confirm.id, confirm.role ?? "staff");
    if (!r.ok) throw new Error(r.error);
    toast.success(r.message);
    router.refresh();
  }

  const confirmText: Record<NonNullable<Confirm>["kind"], { title: string; body: string; cta: string; danger?: boolean }> = {
    reset: {
      title: `Reset two-step for ${confirm?.label}?`,
      body: "Their authenticator and backup codes are removed and they are signed out everywhere. At their next sign-in they set up two-step again before the workspace opens. They get an email about it.",
      cta: "Reset two-step",
      danger: true,
    },
    signout: { title: `Sign ${confirm?.label} out everywhere?`, body: "Every device they are signed in on ends now. Their password and two-step stay as they are.", cta: "Sign out everywhere", danger: true },
    revoke: { title: `Withdraw the invitation to ${confirm?.label}?`, body: "The link stops working. You can send a new one later.", cta: "Withdraw" },
    role: {
      title: confirm?.role === "admin" ? `Make ${confirm?.label} an Admin?` : `Make ${confirm?.label} Staff?`,
      body:
        confirm?.role === "admin"
          ? "Admins see and change everything: billing, settings, the team and every request."
          : "Staff see only the requests assigned to them. Billing, settings and the team stay with Admin.",
      cta: "Change role",
    },
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Team and access view"
          value={tab}
          onChange={(v) => setTab(v as "team" | "assign" | "roles")}
          options={[
            { value: "team", label: `Team ${team.length}` },
            { value: "roles", label: "What each role can do" },
            { value: "assign", label: "Who is on what" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <a href="/admin/settings/users" className="inline-flex min-h-[40px] items-center rounded-ctl px-3 text-sm font-medium text-body outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40">
            All accounts (ban or delete)
          </a>
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" aria-hidden /> Invite to the team
          </Button>
        </div>
      </div>

      {tab === "team" ? (
        <>
          {missing2fa ? (
            <p className="flex items-start gap-2 rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              {missing2fa} {missing2fa === 1 ? "person has" : "people have"} not set up two-step sign-in yet. Their workspace stays closed until they do, at next sign-in.
            </p>
          ) : null}

          <Panel title="Team" sub={`${admins} Admin · ${team.length - admins} Staff`} bodyClassName="p-0" tour="access-team">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-[12.5px] text-muted">
                    <th className="px-4 py-2.5 font-medium sm:px-5">Person</th>
                    <th className="px-3 py-2.5 font-medium">Role</th>
                    <th className="px-3 py-2.5 font-medium">Two-step</th>
                    <th className="px-3 py-2.5 font-medium">Last active</th>
                    <th className="px-3 py-2.5 text-right font-medium">Open requests</th>
                    <th className="w-24 px-3 py-2.5" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {team.map((t) => {
                    const lastAdmin = t.role === "admin" && admins <= 1;
                    return (
                      <tr key={t.id} className={cn(t.banned && "opacity-60")}>
                        <td className="px-4 py-3 sm:px-5">
                          <span className="block font-medium text-ink">
                            {t.name || t.email}
                            {t.me ? <span className="ml-1.5 text-[12px] font-normal text-muted">You</span> : null}
                            {t.banned ? <span className="ml-1.5 text-[12px] font-normal text-bad">Suspended</span> : null}
                          </span>
                          <span className="block text-[13px] text-muted">{t.email}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div
                            role="radiogroup"
                            aria-label={`Role for ${t.name || t.email}`}
                            title={t.me ? "You cannot change your own role" : lastAdmin ? "The last Admin cannot be demoted. Make someone else Admin first." : undefined}
                            className="inline-flex rounded-ctl border border-line-strong bg-paper p-0.5"
                          >
                            {(["staff", "admin"] as const).map((r) => (
                              <button
                                key={r}
                                type="button"
                                role="radio"
                                aria-checked={t.role === r}
                                disabled={pending || t.me || lastAdmin || t.role === r}
                                onClick={() => setConfirm({ kind: "role", id: t.id, label: t.name || t.email, role: r })}
                                className={cn(
                                  "h-8 rounded-[calc(var(--radius-ctl)-2px)] px-2.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                                  t.role === r ? "bg-act text-act-ink" : "text-body hover:text-ink disabled:opacity-60",
                                )}
                              >
                                {r === "admin" ? "Admin" : "Staff"}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {t.twoStep ? (
                            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-good">
                              <ShieldCheck className="size-4" aria-hidden /> On
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-warn">
                              <ShieldAlert className="size-4" aria-hidden /> Not set up
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-[13px] text-body">
                          {ago(t.lastActive)}
                          {t.devices > 1 ? <span className="block text-muted">{t.devices} devices</span> : null}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-body">{t.open}</td>
                        <td className="px-3 py-3 text-right">
                          {!t.me ? (
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                disabled={!t.twoStep || pending}
                                title="Reset two-step"
                                aria-label={`Reset two-step for ${t.name || t.email}`}
                                onClick={() => setConfirm({ kind: "reset", id: t.id, label: t.name || t.email })}
                                className="grid size-8 place-items-center rounded-ctl text-muted outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40"
                              >
                                <KeyRound className="size-4" aria-hidden />
                              </button>
                              <button
                                type="button"
                                disabled={!t.devices || pending}
                                title="Sign out everywhere"
                                aria-label={`Sign ${t.name || t.email} out everywhere`}
                                onClick={() => setConfirm({ kind: "signout", id: t.id, label: t.name || t.email })}
                                className="grid size-8 place-items-center rounded-ctl text-muted outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40"
                              >
                                <LogOut className="size-4" aria-hidden />
                              </button>
                            </div>
                          ) : (
                            <Link href="/account/security" className="text-[13px] font-medium text-accent hover:underline">
                              Yours
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Invitations" sub={waiting.length ? `${waiting.length} waiting` : undefined} bodyClassName="p-0">
            {invites.length ? (
              <ul className="divide-y divide-hairline">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{i.email}</p>
                      <p className="text-[13px] text-muted">
                        {i.role === "admin" ? "Admin" : i.role === "staff" ? "Staff" : `Colleague at ${i.company ?? "a client"}${i.access ? ` · ${i.access}` : ""}`}
                        {i.inviterName ? ` · by ${i.inviterName}` : ""} · sent {day(i.sentAt)}
                        {i.state === "pending" ? ` · expires ${day(i.expiresAt)}` : ""}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", INVITE_STATE[i.state].cls)}>{INVITE_STATE[i.state].label}</span>
                    <div className="flex gap-1">
                      <Button size="sm" disabled={pending} onClick={() => quick(() => resendInvitationAction(i.id))}>
                        <Send className="size-3.5" aria-hidden /> {i.state === "pending" ? "Resend" : "Send again"}
                      </Button>
                      {i.state === "pending" ? (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm({ kind: "revoke", id: i.id, label: i.email })} aria-label={`Withdraw invitation to ${i.email}`}>
                          <X className="size-3.5" aria-hidden /> Withdraw
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 sm:p-5">
                <EmptyState title="No open invitations" why="Invite staff and admins here. Clients invite their own colleagues from their dashboard." />
              </div>
            )}
          </Panel>
        </>
      ) : tab === "roles" ? (
        <Panel title="What each role can do" sub="From the access map the server enforces. Staff never see money amounts.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-semibold">Area</th>
                  <th className="px-3 py-2 text-center font-semibold">Admin</th>
                  <th className="px-3 py-2 text-center font-semibold">Staff</th>
                  <th className="px-3 py-2 text-center font-semibold">Client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {accessMatrix().map((row) => (
                  <tr key={row.area}>
                    <td className="py-2.5 pr-3 text-ink">{row.label}</td>
                    {([row.admin, row.staff, row.client] as const).map((on, i) => (
                      <td key={i} className="px-3 py-2.5 text-center">
                        {on ? <Check className="mx-auto size-4 text-good" aria-label="Yes" /> : <Minus className="mx-auto size-4 text-faint" aria-label="No" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <div className="space-y-5" data-tour="access-assign">
          {unassigned ? (
            <p className="rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">
              {unassigned} open {unassigned === 1 ? "request has" : "requests have"} nobody on {unassigned === 1 ? "it" : "them"}.{" "}
              <Link href="/admin/requests?view=unassigned" className="font-medium text-accent hover:underline">
                Assign them
              </Link>
            </p>
          ) : null}
          {work.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {work.map((w) => (
                <Panel key={w.userId} title={w.name} sub={`${w.role === "admin" ? "Admin" : "Staff"} · ${w.requests.length} open`}>
                  {w.requests.length ? (
                    <ul className="space-y-2">
                      {w.requests.slice(0, 8).map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate">
                            <Link href={`/admin/requests/${r.id}`} className="font-medium text-accent hover:underline">
                              {r.number}
                            </Link>{" "}
                            <span className="text-body">
                              {r.client} · {r.service}
                            </span>
                          </span>
                          <StatusChip domain="request" status={r.status} size="sm" />
                        </li>
                      ))}
                      {w.requests.length > 8 ? <li className="text-[13px] text-muted">and {w.requests.length - 8} more</li> : null}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Nothing assigned. Assign from a request&apos;s page.</p>
                  )}
                </Panel>
              ))}
            </div>
          ) : (
            <EmptyState title="No staff yet" why="Invite staff, then assign requests to them from each request's page." />
          )}
        </div>
      )}

      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} onSent={() => router.refresh()} />
      <ConfirmSheet
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={confirmed}
        title={confirm ? confirmText[confirm.kind].title : ""}
        body={confirm ? confirmText[confirm.kind].body : ""}
        confirmLabel={confirm ? confirmText[confirm.kind].cta : "Confirm"}
        tone={confirm && confirmText[confirm.kind].danger ? "danger" : "default"}
      />
    </div>
  );
}

function InviteSheet({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    setBusy(true);
    const r = await inviteTeamMemberAction({ email: email.trim(), role, message: message.trim() || undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(r.message);
    setEmail("");
    setMessage("");
    onSent();
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Invite to the team"
      description="They get an email with a link that works once, for 7 days. Two-step sign-in is required before their workspace opens."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={send} disabled={busy || !email}>
            {busy ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={error} placeholder="name@litchconsulting.com" />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Role</legend>
          {(
            [
              { v: "staff", t: "Staff", d: "Sees only the requests assigned to them, with their files and client messages." },
              { v: "admin", t: "Admin", d: "Everything: billing, settings, the team and every request." },
            ] as const
          ).map((o) => (
            <label key={o.v} className={cn("flex cursor-pointer gap-3 rounded-ctl border px-3 py-2.5", role === o.v ? "border-act bg-brand-tint" : "border-hairline hover:bg-surface")}>
              <input type="radio" name="invite-role" value={o.v} checked={role === o.v} onChange={() => setRole(o.v)} className="mt-1 accent-[var(--color-act)]" />
              <span>
                <span className="block text-sm font-medium text-ink">{o.t}</span>
                <span className="block text-[13px] text-muted">{o.d}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="space-y-1.5">
          <label htmlFor="invite-message" className="text-sm font-medium text-ink">
            Note <span className="font-normal text-muted">(optional, shown in the email)</span>
          </label>
          <textarea
            id="invite-message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 500))}
            rows={3}
            className="w-full rounded-ctl border border-line-strong bg-paper px-3.5 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>
    </Sheet>
  );
}

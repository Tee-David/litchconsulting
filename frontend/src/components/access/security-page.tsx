"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, KeyRound, LogOut, Monitor, ShieldCheck, Smartphone } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/admin/ui/toaster";
import { Button, ConfirmSheet, Sheet, StatusChip } from "@/components/kit";
import { Field, authErrorText } from "@/components/auth/ui";
import { PasswordStrength, passwordIssue } from "@/components/auth/password-strength";
import {
  hideOnboardingAction,
  passwordChangedAction,
  revokeDeviceAction,
  revokeOtherDevicesAction,
  setPasswordAction,
  twoStepChangedAction,
  updateNameAction,
} from "@/app/account/actions";
import type { DeviceRow, SignInEvent } from "@/app/account/_lib";

// `now` comes from the server render, so the server HTML and the first browser
// render show the same "5 min ago" (no hydration mismatch).
const relTime = (iso: string, now: number) => {
  const d = new Date(iso);
  const mins = Math.round((now - d.getTime()) / 60000);
  if (mins < 2) return "now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(d);
};

function Card({ title, sub, id, children, action }: { title: string; sub?: string; id?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-24 rounded-card border border-hairline bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3 sm:px-5">
        <h2 className="font-display text-[15px] font-semibold text-ink">
          {title}
          {sub ? <span className="ml-2 text-sm font-normal text-muted">{sub}</span> : null}
        </h2>
        {action}
      </header>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export function SecurityPage({
  me,
  devices,
  history,
  methods,
  twoStep,
  alertsHref,
  onboardingClosed,
  now,
}: {
  me: { name: string; email: string; image: string | null; roleLabel: string };
  devices: DeviceRow[];
  history: SignInEvent[];
  methods: { password: boolean; passwordChangedAt: string | null; google: { email: string | null } | null };
  twoStep: { enabled: boolean; required: boolean };
  alertsHref: string;
  onboardingClosed: boolean;
  /** Server time of the render, in ms. */
  now: number;
}) {
  const when = (iso: string) => relTime(iso, now);
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmAll, setConfirmAll] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  const [offOpen, setOffOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [name, setName] = useState(me.name);
  const others = devices.filter((d) => !d.current);

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.message) toast.success(r.message);
        router.refresh();
      } else toast.error(r.error ?? "That did not work.");
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-tight text-ink sm:text-[1.75rem]">Profile and security</h1>
        <p className="mt-1 max-w-[70ch] text-[15px] text-body">Your account, the devices signed in as you, and how you prove it is you.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Card
            title="Devices signed in"
            sub={String(devices.length)}
            action={
              others.length ? (
                <Button size="sm" onClick={() => setConfirmAll(true)} disabled={pending}>
                  <LogOut className="size-4" aria-hidden /> Sign out everywhere else
                </Button>
              ) : null
            }
          >
            {devices.length ? (
              <ul className="divide-y divide-hairline">
                {devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="grid size-9 shrink-0 place-items-center rounded-ctl bg-surface text-muted">
                      {/iPhone|Android|iPad/.test(d.device) ? <Smartphone className="size-4" aria-hidden /> : <Monitor className="size-4" aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{d.device}</p>
                      <p className="text-[13px] text-muted">
                        {d.current ? "This device" : `Last active ${when(d.updatedAt)}`}
                        {d.ip ? ` · ${d.ip}` : ""} · signed in {when(d.createdAt)}
                      </p>
                    </div>
                    {d.current ? (
                      <span className="rounded-full bg-good-soft px-2.5 py-1 text-xs font-medium text-good">This device</span>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeDeviceAction(d.id))}>
                        Sign out
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Only this device is signed in.</p>
            )}
          </Card>

          <Card title="Two-step sign-in" id="two-step">
            {twoStep.enabled ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">Authenticator app</p>
                    <p className="text-[13px] text-muted">{twoStep.required ? "On. Required for Staff and Admin." : "On. You enter a code after your password."}</p>
                  </div>
                  <StatusChip domain="user" status="active" size="sm" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setCodesOpen(true)}>
                    <KeyRound className="size-4" aria-hidden /> New backup codes
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMoveOpen(true)}>
                    Move to a new phone
                  </Button>
                  {!twoStep.required ? (
                    <Button size="sm" variant="ghost" onClick={() => setOffOpen(true)}>
                      Turn off
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">Not set up</p>
                  <p className="text-[13px] text-muted">A code from your phone on top of your password. Recommended if you pay invoices or approve drafts.</p>
                </div>
                <Link href="/account/two-step" className="keep-brand inline-flex h-9 items-center gap-1.5 rounded-ctl bg-act px-3 text-sm font-semibold text-act-ink hover:bg-act-hover">
                  <ShieldCheck className="size-4" aria-hidden /> Set up
                </Link>
              </div>
            )}
          </Card>

          <Card title="Recent sign-ins">
            {history.length ? (
              <ul className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${h.ok ? "bg-good" : "bg-warn"}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {h.ok ? `Signed in${h.method ? ` with ${h.method}` : ""}` : "Failed sign-in (wrong password or code)"}
                        {h.device ? ` · ${h.device}` : ""}
                      </p>
                      <p className="text-[13px] text-muted">
                        {when(h.at)}
                        {h.ip ? ` · ${h.ip}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sign-ins appear here from now on, including failed attempts.</p>
            )}
            <p className="mt-4 text-[13px] text-muted">Not you? Change your password and sign out everywhere else. Admin sees failed sign-ins in the audit log.</p>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <section className="rounded-card border border-hairline bg-paper p-4 sm:p-5">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => updateNameAction(name));
              }}
            >
              <div>
                <p className="font-display text-[15px] font-semibold text-ink">{me.name || me.email}</p>
                <p className="text-[13px] text-muted">
                  {me.roleLabel} · {me.email}
                </p>
              </div>
              <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              <Button type="submit" size="sm" disabled={pending || name.trim() === me.name}>
                Save name
              </Button>
            </form>
            <div className="mt-5 space-y-3 border-t border-hairline pt-4">
              <p className="text-sm font-medium text-ink">Sign-in methods</p>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-body">Google</span>
                <span className="text-muted">{methods.google ? "Linked" : "Not linked"}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-body">
                  Password
                  {methods.passwordChangedAt ? <span className="block text-[12.5px] text-muted">Changed {when(methods.passwordChangedAt)}</span> : null}
                </span>
                <button type="button" onClick={() => setPwOpen(true)} className="font-medium text-accent hover:underline">
                  {methods.password ? "Change" : "Set a password"}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-card border border-hairline bg-paper p-4 sm:p-5">
            <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
              <Bell className="size-4" aria-hidden /> Alerts
            </p>
            <p className="mt-1 text-[13px] text-muted">Choose, per kind of event, whether it reaches you by email, push or only the bell.</p>
            <Link href={alertsHref} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
              Change alerts
            </Link>
          </section>

          {onboardingClosed ? (
            <section className="rounded-card border border-hairline bg-paper p-4 sm:p-5">
              <p className="font-display text-[15px] font-semibold text-ink">Getting-started checklist</p>
              <p className="mt-1 text-[13px] text-muted">You closed it before finishing. Bring it back to your home page.</p>
              <Button size="sm" className="mt-3" disabled={pending} onClick={() => run(() => hideOnboardingAction("reopen"))}>
                Show it again
              </Button>
            </section>
          ) : null}
        </div>
      </div>

      <ConfirmSheet
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => run(() => revokeOtherDevicesAction())}
        title="Sign out everywhere else?"
        body={`${others.length} other ${others.length === 1 ? "device" : "devices"} will need to sign in again. You stay signed in here.`}
        confirmLabel="Sign out other devices"
      />
      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} hasPassword={methods.password} />
      <BackupCodesSheet open={codesOpen} onClose={() => setCodesOpen(false)} hasPassword={methods.password} />
      <DisableSheet open={offOpen} onClose={() => setOffOpen(false)} hasPassword={methods.password} then="/account/security#two-step" title="Turn off two-step sign-in?" />
      <DisableSheet
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        hasPassword={methods.password}
        then="/account/two-step"
        title="Move two-step to a new phone"
        body="This removes the current authenticator and your old backup codes, then walks you through scanning a new code with your new phone."
      />
    </div>
  );
}

function PasswordSheet({ open, onClose, hasPassword }: { open: boolean; onClose: () => void; hasPassword: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signOutOthers, setSignOutOthers] = useState(true);

  async function save() {
    setError(null);
    const issue = passwordIssue(next);
    if (issue) return setError(issue);
    setBusy(true);
    if (hasPassword) {
      const { error: err } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: signOutOthers });
      if (err) {
        setBusy(false);
        return setError(err.code === "INVALID_PASSWORD" ? "Your current password is not right." : authErrorText(err, "Your password was not changed."));
      }
      await passwordChangedAction();
    } else {
      const r = await setPasswordAction(next);
      if (!r.ok) {
        setBusy(false);
        return setError(r.error);
      }
    }
    setBusy(false);
    toast.success(hasPassword ? (signOutOthers ? "Password changed. Other devices are signed out." : "Password changed.") : "Password set.");
    setCurrent("");
    setNext("");
    onClose();
    router.refresh();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={hasPassword ? "Change password" : "Set a password"}
      description={hasPassword ? "We email you a note whenever your password changes." : "Lets you sign in with email and password as well as Google."}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !next || (hasPassword && !current)}>
            {busy ? "Saving…" : "Save password"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {hasPassword ? <Field label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /> : null}
        <div className="space-y-2">
          <Field label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={error} />
          <PasswordStrength password={next} />
        </div>
        {hasPassword ? (
          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} className="size-4 accent-[var(--color-act)]" />
            Sign me out on every other device
          </label>
        ) : null}
      </div>
    </Sheet>
  );
}

function BackupCodesSheet({ open, onClose, hasPassword }: { open: boolean; onClose: () => void; hasPassword: boolean }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setError(null);
    setBusy(true);
    const { data, error: err } = await authClient.twoFactor.generateBackupCodes(hasPassword ? { password } : ({} as { password: string }));
    setBusy(false);
    if (err || !data) return setError(authErrorText(err, "We could not make new codes."));
    setCodes(data.backupCodes);
    void twoStepChangedAction("codes");
  }

  function close() {
    setCodes(null);
    setPassword("");
    setError(null);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      dismissible={!busy}
      title="New backup codes"
      description="Making new codes stops the old ones working. The new ones are shown once."
      footer={
        <div className="flex justify-end gap-2">
          {codes ? (
            <Button
              variant="primary"
              onClick={() => {
                void navigator.clipboard?.writeText(codes.join("\n")).then(() => toast.success("Copied. Keep them somewhere safe."));
              }}
            >
              Copy codes
            </Button>
          ) : (
            <Button variant="primary" onClick={make} disabled={busy || (hasPassword && !password)}>
              {busy ? "Making…" : "Make new codes"}
            </Button>
          )}
        </div>
      }
    >
      {codes ? (
        <ul className="grid grid-cols-2 gap-2 rounded-card border border-hairline bg-surface p-4 font-mono text-[14px] text-ink">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : hasPassword ? (
        <Field label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
      ) : (
        <p className="text-sm text-body">{error ?? "Press Make new codes to continue."}</p>
      )}
    </Sheet>
  );
}

function DisableSheet({ open, onClose, hasPassword, then, title, body }: { open: boolean; onClose: () => void; hasPassword: boolean; then: string; title: string; body?: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setError(null);
    setBusy(true);
    const { error: err } = await authClient.twoFactor.disable(hasPassword ? { password } : ({} as { password: string }));
    if (err) {
      setBusy(false);
      return setError(authErrorText(err, "That did not work."));
    }
    await twoStepChangedAction("disabled");
    window.location.href = then;
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={title}
      description={body ?? "Your account will be protected by your password alone."}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={go} disabled={busy || (hasPassword && !password)}>
            {busy ? "Working…" : "Continue"}
          </Button>
        </div>
      }
    >
      {hasPassword ? (
        <Field label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
      ) : (
        <p className="text-sm text-body">{error ?? "Confirm to continue."}</p>
      )}
    </Sheet>
  );
}

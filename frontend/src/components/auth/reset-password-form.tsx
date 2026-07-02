"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { FloatingInput } from "./ui";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const linkError = params.get("error"); // e.g. INVALID_TOKEN from Better Auth

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidLink = !token || Boolean(linkError);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!token) {
      setError("This reset link is invalid or has expired.");
      return;
    }
    setLoading(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setLoading(false);
    if (error) {
      setError(error.message || "Could not reset password. Request a new link.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1600);
  }

  if (done) {
    return (
      <div>
        <div className="mb-4 grid size-11 place-items-center rounded-full bg-brand-tint text-brand">
          <CheckCircle2 className="size-5" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Password updated</h1>
        <p className="mt-2 text-sm text-body">Redirecting you to sign in…</p>
      </div>
    );
  }

  if (invalidLink) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Link expired</h1>
        <p className="mt-2 text-sm text-body">
          This password reset link is invalid or has expired. Request a fresh one.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Request new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Set a new password</h1>
      <p className="mt-1.5 text-sm text-body">Choose a strong password you don&rsquo;t use elsewhere.</p>

      <form onSubmit={onSubmit} className="mt-7 space-y-3">
        <FloatingInput
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FloatingInput
          id="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-body">
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}

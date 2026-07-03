"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { FloatingInput } from "./ui";
import { useToast } from "@/components/admin/ui/toaster";

export function ForgotPasswordForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setLoading(false);
    if (error) {
      const msg = error.message || "Something went wrong. Please try again.";
      setError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Reset link sent — check your email.");
    setSent(true);
  }

  if (sent) {
    return (
      <div>
        <div className="mb-4 grid size-11 place-items-center rounded-full bg-brand-tint text-brand">
          <MailCheck className="size-5" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Check your email</h1>
        <p className="mt-2 text-sm text-body">
          If an account exists for <span className="font-semibold text-ink">{email}</span>, we&rsquo;ve sent a link to
          reset your password. The link expires in 1 hour.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Reset password</h1>
      <p className="mt-1.5 text-sm text-body">
        Enter the email tied to your account and we&rsquo;ll send you a reset link.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-3">
        <FloatingInput
          id="email"
          label="Email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-body">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}

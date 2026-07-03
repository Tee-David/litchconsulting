"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { FloatingInput, OrDivider, GoogleButton } from "./ui";
import { useToast } from "@/components/admin/ui/toaster";

export function LoginForm() {
  const toast = useToast();
  const params = useSearchParams();
  const redirectParam = params.get("redirect");
  const redirectTo = redirectParam && redirectParam.startsWith("/") ? redirectParam : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn.email({ email, password, rememberMe: remember });
    setLoading(false);
    if (error) {
      const msg = error.message || "Invalid email or password.";
      setError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Signed in — redirecting…");
    // Hard navigation so the fresh session cookie is included on the next request.
    window.location.href = redirectTo;
  }

  function google() {
    void signIn.social({ provider: "google", callbackURL: redirectTo });
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1.5 text-sm text-body">Sign in to your Litch Consulting account.</p>

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
        <FloatingInput
          id="password"
          label="Password"
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-body">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 rounded accent-brand"
            />
            Remember me
          </label>
          <Link href="/forgot-password" className="text-xs font-semibold text-brand hover:underline">
            Forgot password?
          </Link>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Log in"}
        </button>
      </form>

      <div className="mt-5">
        <OrDivider />
        <div className="mt-4">
          <GoogleButton onClick={google} label="Continue with Google" disabled={loading} />
        </div>
      </div>

      <p className="mt-7 text-center text-sm text-body">
        Don&rsquo;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-brand hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

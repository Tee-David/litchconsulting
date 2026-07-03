"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth-client";
import { isDisposableEmail } from "@/lib/block-disposable-email";
import { FloatingInput, OrDivider, GoogleButton } from "./ui";
import { PasswordStrength } from "./password-strength";
import { PasswordConfirmInput } from "./password-confirm-input";
import { useToast } from "@/components/admin/ui/toaster";

export function SignupForm() {
  const toast = useToast();
  const params = useSearchParams();
  const redirectParam = params.get("redirect");
  const redirectTo = redirectParam && redirectParam.startsWith("/") ? redirectParam : "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Please enter your full name.");
    if (isDisposableEmail(email)) return setError("Please use a permanent email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setLoading(true);
    // role is omitted → Better Auth applies the default ("client").
    const { error } = await signUp.email({ name: name.trim(), email, password });
    setLoading(false);
    if (error) {
      const msg = error.message || "Could not create your account.";
      setError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Account created — redirecting…");
    window.location.href = redirectTo;
  }

  function google() {
    void signIn.social({ provider: "google", callbackURL: redirectTo });
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Create your account</h1>
      <p className="mt-1.5 text-sm text-body">
        Access your secure client portal, documents and bookings.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-3">
        <FloatingInput
          id="name"
          label="Full name"
          placeholder="e.g. Adaeze Okafor"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
        <div>
          <FloatingInput
            id="password"
            label="Password"
            type="password"
            placeholder="Create a strong password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrength password={password} forbidden={[name, email.split("@")[0], email]} />
        </div>
        <PasswordConfirmInput passwordToMatch={password} value={confirm} onChange={setConfirm} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="mt-5">
        <OrDivider />
        <div className="mt-4">
          <GoogleButton onClick={google} label="Sign up with Google" disabled={loading} />
        </div>
      </div>

      <p className="mt-7 text-center text-sm text-body">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

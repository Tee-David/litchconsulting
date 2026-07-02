"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth-client";
import { isDisposableEmail } from "@/lib/block-disposable-email";
import { FloatingInput, OrDivider, GoogleButton } from "./ui";

const STRENGTH_LABEL = ["Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["#e5484d", "#f5a524", "#4c6ef5", "#16a34a"];

function scorePassword(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[0-9]|[^A-Za-z0-9]/.test(pw)) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (pw.length >= 12) s++;
  return Math.min(Math.max(s, 1), 4);
}

function PasswordStrength({ password }: { password: string }) {
  const score = scorePassword(password);
  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: i < score ? STRENGTH_COLOR[score - 1] : "var(--color-hairline)" }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs" style={{ color: STRENGTH_COLOR[score - 1] }}>
        {STRENGTH_LABEL[score - 1]} password
      </p>
    </div>
  );
}

export function SignupForm() {
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
      setError(error.message || "Could not create your account.");
      return;
    }
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
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <FloatingInput
          id="email"
          label="Email"
          type="email"
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
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password.length > 0 && <PasswordStrength password={password} />}
        </div>
        <div>
          <FloatingInput
            id="confirm"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {confirm.length > 0 && (
            <p className={`mt-1.5 text-xs ${password === confirm ? "text-green-600" : "text-red-600"}`}>
              {password === confirm ? "Passwords match" : "Passwords don't match"}
            </p>
          )}
        </div>

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

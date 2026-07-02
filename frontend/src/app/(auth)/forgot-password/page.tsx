import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Reset password</h1>
        <p className="mt-3 text-sm text-body">
          Password reset by email is coming soon. In the meantime, contact us at{" "}
          <a href="mailto:adenuga.saheed@gmail.com" className="font-semibold text-brand hover:underline">
            adenuga.saheed@gmail.com
          </a>{" "}
          and we&rsquo;ll help you back in.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Back to log in
        </Link>
      </div>
    </AuthShell>
  );
}

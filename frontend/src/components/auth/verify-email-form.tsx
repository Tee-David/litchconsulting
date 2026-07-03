"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";
import { useToast } from "@/components/admin/ui/toaster";

/** Animated verify-email screen: floating mail icon → springing check on success. */
export function VerifyEmailForm() {
  const params = useSearchParams();
  const verified = params.get("verified") === "1";
  const { data: session } = useSession();
  const email = session?.user?.email;
  const dashHref = (session?.user as { role?: string } | undefined)?.role === "admin" ? "/admin" : "/dashboard";
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function resend() {
    if (!email) return toast.error("Sign in first to resend the link.");
    setLoading(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/verify-email?verified=1",
    });
    setLoading(false);
    if (error) return toast.error(error.message || "Could not send email.");
    toast.success("Verification email sent.");
  }

  if (verified) {
    return (
      <div className="text-center">
        <motion.div
          initial={{ scale: 0, rotate: -25 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
          className="mx-auto mb-6 grid size-16 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-500"
        >
          <CheckCircle2 className="size-8" />
        </motion.div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Email verified</h1>
        <p className="mt-2 text-sm text-body">Your account is all set. Welcome to Litch Consulting.</p>
        <Link
          href={dashHref}
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Continue <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="relative mx-auto mb-6 grid size-16 place-items-center">
        {/* pulsing rings */}
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-2xl bg-brand/20"
            initial={{ scale: 0.9, opacity: 0.5 }}
            animate={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: i * 1.1 }}
          />
        ))}
        {/* floating mail */}
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          className="relative grid size-16 place-items-center rounded-2xl bg-brand-tint text-brand"
        >
          <Mail className="size-8" />
        </motion.div>
      </div>

      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Check your email</h1>
      <p className="mt-2 text-sm text-body">
        We sent a verification link{email ? " to " : ""}
        {email && <span className="font-semibold text-ink">{email}</span>}. Click it to confirm your account.
      </p>

      <button
        type="button"
        onClick={resend}
        disabled={loading}
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-paper px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Resend email
      </button>

      <p className="mt-6 text-sm text-body">
        <Link href={dashHref} className="font-semibold text-brand hover:underline">
          Skip for now
        </Link>
      </p>
    </div>
  );
}

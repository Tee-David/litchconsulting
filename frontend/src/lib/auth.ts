import { betterAuth } from "better-auth";
import { after } from "next/server";
import { pool } from "./db/pg-pool";

/**
 * Better Auth server instance (Next.js, same-origin httpOnly cookies).
 * Database: the shared CockroachDB pool (`db/pg-pool.ts`) — pinned CA cert and
 * fail-fast timeouts, the same pool Drizzle uses. One pool, not two: a slow
 * connect used to hang Better Auth's session check for ~2 min and cascade into
 * "a server error occurred" across pages.
 *
 * Litch uses just two roles: `admin` (firm staff) and `client` (default).
 * Admin accounts are seeded/promoted manually; self-signup is always a client.
 */

const googleId = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled = Boolean(googleId && googleSecret);

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  // Pinned, not inferred: relying on Better Auth's request-host inference in prod
  // produced a hostless `http:///verify-email` link (Google flagged it dead) —
  // BETTER_AUTH_URL is intentionally unset in prod, so the inference has to work
  // every time with no fallback, and it didn't. Same site-URL fallback as email.ts.
  baseURL: (
    process.env.BETTER_AUTH_URL ||
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://www.litchconsulting.com"
  ).replace(/\/$/, ""),
  trustedOrigins: [
    "http://localhost:3000",
    "https://litchconsulting.com",
    "https://www.litchconsulting.com",
    "https://litch.com",
    "https://*.vercel.app", // preview deployments
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // The whole request/payment lifecycle is email-borne (receipts, quotes,
    // deliverable notices), so an unreachable inbox is worse than one verify
    // round-trip. Existing accounts were backfilled as verified before this
    // flipped (scripts/apply-schema.ts one-off).
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const { sendPasswordResetEmail } = await import("./email");
      await sendPasswordResetEmail(user.email, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { sendVerificationEmail } = await import("./email");
      await sendVerificationEmail(user.email, url);
    },
    afterEmailVerification: async (user) => {
      // First verified session → welcome them into the portal. Best-effort.
      try {
        const { sendEmail, emailLayout } = await import("./email");
        await sendEmail({
          to: user.email,
          subject: "Welcome to Litch Consulting",
          html: emailLayout(`
            <p style="margin:0 0 14px;">Hi ${user.name?.split(" ")[0] || "there"},</p>
            <p style="margin:0 0 18px;">Your account is verified — welcome aboard. From your dashboard you can request a service, track progress, pay invoices, download deliverables, and reach us any time.</p>
            <p style="margin:0 0 20px;"><a href="${(process.env.BETTER_AUTH_URL || "https://litchconsulting.com").replace(/\/$/, "")}/dashboard" style="display:inline-block;background:#0a196d;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px;">Open your dashboard</a></p>
            <p style="margin:0;color:#5b6474;font-size:13px;">Questions? Just reply to this email — a real person reads it.</p>
          `),
        });
      } catch (err) {
        console.error("[auth] welcome email failed:", err);
      }
    },
  },
  socialProviders: googleEnabled
    ? { google: { clientId: googleId!, clientSecret: googleSecret! } }
    : {},
  user: {
    additionalFields: {
      // admin | client — drives dashboard vs admin routing. Not settable at
      // signup in practice (self-signup is forced to "client" in the UI/action);
      // input:true keeps the field writable when seeding an admin.
      role: {
        type: "string",
        required: false,
        defaultValue: "client",
        input: true,
      },
      // admin moderation flag — when true, guarded layouts bounce the user out.
      banned: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  advanced: {
    cookiePrefix: "litch",
    // On Vercel, Better Auth sends verification/reset mail as a background task;
    // without extending the function lifetime the serverless invocation returns
    // and the SMTP send is cut off (verification email never arrives). `after`
    // keeps the function alive until the promise settles. Outside a request
    // scope (scripts) `after` throws — fall back to letting it run inline.
    backgroundTasks: {
      handler: (promise: Promise<unknown>) => {
        try {
          after(promise);
        } catch {
          void promise;
        }
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;

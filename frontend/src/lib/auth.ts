import { betterAuth } from "better-auth";
import { Pool } from "pg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Better Auth server instance (Next.js, same-origin httpOnly cookies).
 * Database: CockroachDB (Postgres wire-compatible) via node-postgres Pool.
 *
 * Litch uses just two roles: `admin` (firm staff) and `client` (default).
 * Admin accounts are seeded/promoted manually; self-signup is always a client.
 */
function resolveSSL() {
  const envCert =
    process.env.COCKROACH_CA_CERT || process.env.COCKROACH_CERT || process.env.COCKROACHDB_CERT;
  if (envCert && envCert.includes("BEGIN CERTIFICATE")) {
    return { ca: envCert, rejectUnauthorized: true as const };
  }
  for (const f of [
    path.join(process.cwd(), "certs", "cockroach-ca.crt"),
    path.join(os.homedir(), ".postgresql", "root.crt"),
  ]) {
    try {
      return { ca: fs.readFileSync(f, "utf8"), rejectUnauthorized: true as const };
    } catch {}
  }
  // CockroachDB Cloud certs chain to a publicly trusted root, so Node's system
  // CAs still validate the connection when no cert file is present.
  return { rejectUnauthorized: true as const };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL,
  ssl: resolveSSL(),
  max: 5,
});

const googleId = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled = Boolean(googleId && googleSecret);

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || process.env.AUTH_URL,
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
  },
});

export type Session = typeof auth.$Infer.Session;

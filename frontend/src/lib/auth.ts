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
    // Verification email not required to sign in yet. SMTP (Truehost) is wired
    // for password reset below via lib/email.
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      const { sendPasswordResetEmail } = await import("./email");
      await sendPasswordResetEmail(user.email, url);
    },
  },
  emailVerification: {
    // A verification email is sent on sign-up, but verification is not required
    // to log in (so existing/seeded accounts aren't locked out).
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { sendVerificationEmail } = await import("./email");
      await sendVerificationEmail(user.email, url);
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

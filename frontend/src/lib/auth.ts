import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { after } from "next/server";
import { pool } from "./db/pg-pool";

/**
 * Better Auth server instance (Next.js, same-origin httpOnly cookies).
 * Database: the shared CockroachDB pool (`db/pg-pool.ts`) — pinned CA cert and
 * fail-fast timeouts, the same pool Drizzle uses. One pool, not two: a slow
 * connect used to hang Better Auth's session check for ~2 min and cascade into
 * "a server error occurred" across pages.
 *
 * Roles: `admin` (owners), `staff` (team members, assigned work only) and
 * `client` (default). Self-signup is always a client; admin/staff come from
 * invitations or Settings → Access. See lib/access.ts for what each can do.
 *
 * Two-step sign-in (twoFactor plugin): required for admin and staff, optional
 * for clients — the role policy and the per-session hold live in
 * lib/two-step.ts and lib/server-user.ts; this file marks sessions that
 * passed the second factor.
 */

const googleId = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled = Boolean(googleId && googleSecret);

// Pinned, not inferred: relying on Better Auth's request-host inference in prod
// produced a hostless `http:///verify-email` link (Google flagged it dead) —
// BETTER_AUTH_URL is intentionally unset in prod, so the inference has to work
// every time with no fallback, and it didn't. Same site-URL fallback as email.ts.
const SITE_URL = (
  process.env.BETTER_AUTH_URL ||
  process.env.AUTH_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://www.litchconsulting.com"
).replace(/\/$/, "");

/** Lazily loaded server helpers (keeps this module light for the edge-less routes). */
const lib = {
  audit: () => import("./audit").then((m) => m.recordAudit),
  templates: () => import("./email-templates"),
  twoStep: () => import("./two-step"),
};

/** Best-effort side work that must survive the response on Vercel. */
function background(task: () => Promise<unknown>) {
  const run = () => task().catch((err) => console.error("[auth] background task failed:", err));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Service the visitor picked on /get-started, carried in the verify link (`?draft=<uuid>`). */
async function draftServiceName(url: string): Promise<string | null> {
  try {
    const cb = new URL(url).searchParams.get("callbackURL") || "";
    const draft = new URL(cb, SITE_URL).searchParams.get("draft");
    if (!draft || !/^[0-9a-f-]{36}$/i.test(draft)) return null;
    const res = await pool.query<{ service_slug: string | null }>(`SELECT "service_slug" FROM "request_draft" WHERE "id" = $1 LIMIT 1`, [draft]);
    const slug = res.rows[0]?.service_slug;
    if (!slug) return null;
    const { services } = await import("./content");
    return services.find((s) => s.slug === slug)?.name ?? null;
  } catch {
    return null;
  }
}

const deviceOf = (ua?: string | null) => {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
};

const PASSWORD_PATHS = new Set(["/sign-up/email", "/reset-password", "/change-password"]);
const SECOND_FACTOR_PATHS = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

/** httpOnly cookie naming the invitation a Google sign-in is accepting (15 min). */
export const INVITE_COOKIE = "litch_invite";

export const auth = betterAuth({
  appName: "Litch Consulting",
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  baseURL: SITE_URL,
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3101",
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
    // A reset means someone may have had the password: end every session.
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      const { sendTemplate } = await lib.templates();
      await sendTemplate("passwordReset", { name: user.name, url }, { to: user.email });
    },
    onPasswordReset: async ({ user }) => {
      background(async () => {
        const { sendTemplate } = await lib.templates();
        await sendTemplate("securityNotice", { name: user.name, what: "Your password was changed", when: new Date() }, { to: user.email });
        const recordAudit = await lib.audit();
        await recordAudit({ action: "auth.password_reset", entity: "user", entityId: user.id, actorId: user.id, actorName: user.name || user.email });
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // An unverified person who tries to sign in gets a fresh link automatically.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      const { sendTemplate } = await lib.templates();
      const serviceName = await draftServiceName(url);
      await sendTemplate("verifyEmail", { name: user.name, url, serviceName }, { to: user.email });
    },
    afterEmailVerification: async (user) => {
      // First verified session → welcome them into the portal. Best-effort.
      background(async () => {
        const { sendTemplate } = await lib.templates();
        await sendTemplate("welcome", { name: user.name, role: "client", homeUrl: `${SITE_URL}/dashboard` }, { to: user.email, dedupeKey: `welcome:${user.id}` });
      });
    },
  },
  socialProviders: googleEnabled
    ? { google: { clientId: googleId!, clientSecret: googleSecret!, prompt: "select_account" } }
    : {},
  account: {
    // Google links to an existing account only when Google says the address
    // is verified and it matches (Better Auth's implicit-linking rule).
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  user: {
    additionalFields: {
      // admin | staff | client (lib/access.ts). NEVER client-writable:
      // with input:true anyone could POST /api/auth/sign-up/email with
      // {"role":"admin"} and get an admin account. Roles are set server-side
      // only — invitations (lib/invitations.ts), Settings → Access, or a direct
      // DB update (scripts/seed-users.ts).
      role: {
        type: "string",
        required: false,
        defaultValue: "client",
        input: false,
      },
      // admin moderation flag — a suspended account cannot start a session.
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
  plugins: [
    twoFactor({
      issuer: "Litch Consulting",
      // Google-only staff have no password; they still need an authenticator.
      allowPasswordless: true,
      backupCodeOptions: { amount: 10, length: 10 },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        // Accepting an invitation with Google (app/invite/[token]): the
        // invitation is named by the INVITE_COOKIE set just before the
        // redirect. A Google account with any other email must not become a
        // new (client) account from that flow, so creation is refused here and
        // Better Auth returns to the invite page with ?error=.
        before: async (user, ctx) => {
          const path = ctx?.path ?? "";
          if (!path.startsWith("/callback")) return;
          const cookie = ctx?.request?.headers.get("cookie") ?? "";
          const token = cookie
            .split(";")
            .map((c) => c.trim())
            .find((c) => c.startsWith(`${INVITE_COOKIE}=`))
            ?.slice(INVITE_COOKIE.length + 1);
          if (!token) return;
          const { pendingInviteEmail } = await import("./invitations");
          const invited = await pendingInviteEmail(decodeURIComponent(token));
          if (!invited || invited !== user.email.trim().toLowerCase()) {
            throw new APIError("FORBIDDEN", { message: "This Google account does not match the invitation.", code: "INVITE_EMAIL_MISMATCH" });
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // Suspended accounts never get a session (and banning revokes the
          // ones they had — app/admin/settings/actions.ts).
          const res = await pool.query<{ banned: boolean | null }>(`SELECT "banned" FROM "user" WHERE "id" = $1`, [session.userId]);
          if (res.rows[0]?.banned) {
            throw new APIError("FORBIDDEN", {
              message: "This account is suspended. Contact Litch Consulting if you think this is a mistake.",
              code: "ACCOUNT_SUSPENDED",
            });
          }
        },
        after: async (session, ctx) => {
          const path = ctx?.path ?? "";
          try {
            // Sessions minted by the second-factor endpoints passed two-step.
            // A password sign-in of a two-step user only survives when the
            // device is trusted (otherwise the plugin deletes it a moment
            // later), so that session counts as verified too.
            let verified = path.startsWith("/two-factor/");
            if (!verified && path === "/sign-in/email") {
              const r = await pool.query<{ on: boolean | null }>(`SELECT "twoFactorEnabled" AS "on" FROM "user" WHERE "id" = $1`, [session.userId]);
              verified = Boolean(r.rows[0]?.on);
            }
            if (verified) {
              const { markSessionVerified } = await lib.twoStep();
              await markSessionVerified(session.id, session.userId);
            }
          } catch (err) {
            console.error("[auth] two-step mark failed:", err);
          }
          // Sign-in history (shown on /account/security and in the audit log).
          if (path && !path.startsWith("/two-factor/enable")) {
            background(async () => {
              const recordAudit = await lib.audit();
              await recordAudit({
                action: "auth.signed_in",
                entity: "user",
                entityId: session.userId,
                actorId: session.userId,
                actorName: "sign-in",
                meta: {
                  method: path.startsWith("/callback") ? "google" : path.startsWith("/two-factor") ? "password + code" : path === "/verify-email" ? "email link" : "password",
                  ip: session.ipAddress || null,
                  device: deviceOf(session.userAgent),
                },
              });
            });
          }
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Second-factor guesses: a shared (DB-backed) budget on top of the
      // plugin's own lockout, which only covers the sign-in path.
      if (SECOND_FACTOR_PATHS.has(ctx.path)) {
        const { rateLimit, callerKey } = await import("./rate-limit");
        const headers = ctx.request?.headers ?? new Headers();
        const r = await rateLimit(callerKey(headers, "two-step"), { limit: 10, windowSeconds: 600 });
        if (!r.ok) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes tried. Wait a few minutes and try again.", code: "TOO_MANY_CODES" });
      }
      // Known-breached passwords are refused wherever a password is chosen.
      if (PASSWORD_PATHS.has(ctx.path)) {
        const body = (ctx.body ?? {}) as { password?: unknown; newPassword?: unknown };
        const pw = typeof body.password === "string" ? body.password : typeof body.newPassword === "string" ? body.newPassword : null;
        if (pw) {
          const { passwordBreached } = await import("./invitations");
          if (await passwordBreached(pw)) {
            throw new APIError("BAD_REQUEST", {
              message: "That password has appeared in a known data breach. Choose a different one.",
              code: "PASSWORD_BREACHED",
            });
          }
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      const failed = isAPIError(returned);
      // A correct code on an already signed-in session (Google sign-in, or a
      // re-check) marks THAT session as verified.
      if (SECOND_FACTOR_PATHS.has(ctx.path) && !failed) {
        try {
          const s = await getSessionFromCtx(ctx);
          if (s?.session) {
            const { markSessionVerified } = await lib.twoStep();
            await markSessionVerified(s.session.id, s.user.id);
          }
        } catch (err) {
          console.error("[auth] two-step mark (in-session) failed:", err);
        }
      }
      // Failed password sign-ins go into the person's sign-in history.
      if (ctx.path === "/sign-in/email" && failed) {
        const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase();
        if (!email) return;
        background(async () => {
          const r = await pool.query<{ id: string }>(`SELECT "id" FROM "user" WHERE lower("email") = $1 LIMIT 1`, [email]);
          const id = r.rows[0]?.id;
          if (!id) return;
          const recordAudit = await lib.audit();
          const headers = ctx.request?.headers;
          await recordAudit({
            action: "auth.sign_in_failed",
            entity: "user",
            entityId: id,
            actorId: null,
            actorName: "sign-in",
            meta: {
              reason: (returned as { body?: { code?: string } }).body?.code ?? "failed",
              ip: headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
              device: deviceOf(headers?.get("user-agent")),
            },
          });
        });
      }
    }),
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

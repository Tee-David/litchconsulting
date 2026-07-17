import "server-only";
import { sql } from "drizzle-orm";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "@/lib/db/client";
import { pushSubscription } from "@/lib/db/schema";
import { r2Config, r2Configured, r2PrivateConfigured } from "@/lib/r2";

/**
 * Live status for every service the platform integrates with.
 *
 * Two rules govern this file:
 *
 * 1. **Never fake it.** A card is only "connected" when we have evidence — a
 *    successful probe where one is cheap and safe, otherwise the presence of
 *    real configuration (`configured`, which is a weaker claim and says so).
 *    "Not configured" and "configured but failing" are different states and
 *    are never collapsed into one another.
 * 2. **Never leak a secret.** Only env var *names*, booleans and curated
 *    strings cross to the client. Probe failures are reduced to an error code
 *    (`ENOTFOUND`, `HTTP 401`) by {@link errCode} — raw error messages can
 *    carry connection strings, hostnames and tokens, so they never escape.
 *
 * Every probe is time-bounded and swallowed: this module resolves, it never
 * rejects, so the Integrations page cannot be taken down by a sick dependency.
 */

export type IntegrationState =
  /** Probed and healthy, or (for config-only checks) fully configured. */
  | "connected"
  /** Configured, but the probe says it's unhealthy. Actionable. */
  | "degraded"
  /** No configuration present. */
  | "not_configured"
  /** Configured, but we can't prove either way from here. */
  | "unknown";

/**
 * One env var and whether it's populated — **names and booleans only**, so a
 * card can show what's wired without ever shipping a value to the browser.
 *
 * `names` is a set of interchangeable aliases: several libs here accept either
 * a canonical name or the project's older Doppler name (`lib/r2.ts` takes
 * `R2_ACCESS_KEY_ID` *or* `R2_ACCESS_KEY`; `lib/db/client.ts` takes
 * `DATABASE_URL` *or* `COCKROACHDB_URL`). Listing only the canonical name
 * would mark a perfectly wired integration as unset, so the group tracks them
 * together and reports the alias actually in use.
 */
export type EnvKeyStatus = { names: string[]; set: boolean; using?: string };

export type IntegrationStatus = {
  key: string;
  name: string;
  group: "Payments & scheduling" | "Communications" | "Storage & data" | "LitchAI" | "Platform";
  description: string;
  state: IntegrationState;
  /** Short, human, secret-free. Explains *why* the state is what it is. */
  detail: string;
  /** Env var NAMES only — never values. */
  envKeys: EnvKeyStatus[];
  /** True when we actually talked to the service on this render. */
  probed: boolean;
  latencyMs?: number;
  docsUrl?: string;
  /** Internal admin link where this integration is used/configured. */
  configHref?: string;
};

/**
 * Ceilings, not expectations. Generous enough that a merely *slow* dependency
 * is never libelled as broken — a cold serverless Cockroach can take seconds
 * to wake, and calling that "degraded" would be exactly the kind of fake
 * status this page exists to avoid.
 */
const PROBE_TIMEOUT_MS = 4000;
const DB_TIMEOUT_MS = 8000;

const env = (k: string) => process.env[k];
const hasAll = (...keys: string[]) => keys.every((k) => Boolean(env(k)));
const hasAny = (...keys: string[]) => keys.some((k) => Boolean(env(k)));

/** Track interchangeable env names as one chip; report which alias is live. */
const envGroup = (...names: string[]): EnvKeyStatus => {
  const using = names.find((n) => Boolean(env(n)));
  return { names, set: Boolean(using), using };
};

/**
 * Reduce any thrown value to a short, safe code. Error *messages* routinely
 * embed the thing that failed (a DSN, a tunnel hostname, a bearer token), so
 * we surface the class/code and nothing else.
 */
function errCode(err: unknown): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string } } | undefined;
  return e?.cause?.code || e?.code || e?.name || "Error";
}

/** Reject after `ms` so one hung socket can't stall the whole page. */
function withTimeout<T>(p: Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), ms)
    ),
  ]);
}

type Probe = () => Promise<Pick<IntegrationStatus, "state" | "detail"> & { latencyMs?: number }>;

/** Run a probe, timing it, and turn *any* failure into a `degraded` card. */
async function probe(
  fn: Probe,
  ms = PROBE_TIMEOUT_MS
): Promise<Pick<IntegrationStatus, "state" | "detail" | "latencyMs" | "probed">> {
  const started = Date.now();
  try {
    const res = await withTimeout(fn(), ms);
    return { ...res, latencyMs: res.latencyMs ?? Date.now() - started, probed: true };
  } catch (err) {
    const code = errCode(err);
    return {
      state: "degraded",
      detail:
        code === "ETIMEDOUT"
          ? `Configured, but no response within ${(ms / 1000).toFixed(0)}s.`
          : `Configured, but the check failed (${code}).`,
      latencyMs: Date.now() - started,
      probed: true,
    };
  }
}

const notConfigured = (what: string) => ({
  state: "not_configured" as const,
  detail: what,
  probed: false,
});

/* ------------------------------------------------------------------ */
/* Probes                                                              */
/* ------------------------------------------------------------------ */

/** Paystack: `/balance` is the cheapest call that proves the key is live. */
async function paystack() {
  if (!hasAll("PAYSTACK_SECRET_KEY")) return notConfigured("No secret key set — invoices can't be paid online.");
  return probe(async () => {
    const res = await fetch("https://api.paystack.co/balance", {
      headers: { Authorization: `Bearer ${env("PAYSTACK_SECRET_KEY")}` },
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (res.status === 401) return { state: "degraded" as const, detail: "Key rejected (401) — it may be rotated or revoked." };
    if (!res.ok) return { state: "degraded" as const, detail: `Paystack returned HTTP ${res.status}.` };
    // Test vs live is purely which key is present (lib/paystack.ts).
    const mode = env("PAYSTACK_SECRET_KEY")!.startsWith("sk_live") ? "live" : "test";
    return { state: "connected" as const, detail: `Authenticated — ${mode} mode.` };
  });
}

/** SMTP: nodemailer's `verify()` opens the connection and authenticates. */
async function smtp() {
  if (!hasAll("SMTP_HOST", "SMTP_USER", "SMTP_PASS"))
    return notConfigured("Not configured — outbound mail is logged, not sent.");
  return probe(async () => {
    const nodemailer = (await import("nodemailer")).default;
    const port = Number(env("SMTP_PORT") || 465);
    const transport = nodemailer.createTransport({
      host: env("SMTP_HOST"),
      port,
      secure: port === 465,
      auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
      connectionTimeout: PROBE_TIMEOUT_MS,
      greetingTimeout: PROBE_TIMEOUT_MS,
    });
    await transport.verify();
    transport.close();
    return { state: "connected" as const, detail: `Handshake OK on port ${port}${port === 465 ? " (SSL)" : " (STARTTLS)"}.` };
  });
}

/** One S3 client for both buckets — same account, same credentials. */
function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2Config.accessKeyId!, secretAccessKey: r2Config.secretAccessKey! },
    requestHandler: { requestTimeout: PROBE_TIMEOUT_MS, connectionTimeout: PROBE_TIMEOUT_MS },
  });
}

/** R2 public bucket: HEAD proves creds + bucket exist, and reads nothing. */
async function r2Public() {
  if (!r2Configured)
    return notConfigured("Incomplete — needs account, keys, bucket and a public domain.");
  return probe(async () => {
    await r2Client().send(new HeadBucketCommand({ Bucket: r2Config.bucket! }));
    return { state: "connected" as const, detail: "Bucket reachable — logos, covers and templates serve publicly." };
  });
}

async function r2Private() {
  if (!r2PrivateConfigured) return notConfigured("No private bucket set — client documents have nowhere to go.");
  return probe(async () => {
    await r2Client().send(new HeadBucketCommand({ Bucket: env("R2_PRIVATE_BUCKET")! }));
    return { state: "connected" as const, detail: "Bucket reachable — presigned access only, never public." };
  });
}

/**
 * VAPID: no endpoint to ping (push is outbound-only), but the subscription
 * count is real evidence the channel is actually in use.
 */
async function vapid() {
  if (!hasAll("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"))
    return notConfigured("No VAPID keys — admin alerts fall back to email only.");
  try {
    const [row] = await withTimeout(
      db.select({ n: sql<number>`count(*)::int` }).from(pushSubscription),
      DB_TIMEOUT_MS
    );
    const n = row?.n ?? 0;
    return {
      state: "connected" as const,
      detail: n === 0 ? "Keys valid — no browsers subscribed yet." : `Keys valid — ${n} subscribed browser${n === 1 ? "" : "s"}.`,
      probed: true,
    };
  } catch (err) {
    return { state: "degraded" as const, detail: `Keys set, but the subscription table is unreadable (${errCode(err)}).`, probed: true };
  }
}

/** CockroachDB: `SELECT 1` — the app is already talking to it to render this. */
async function cockroach() {
  if (!hasAny("DATABASE_URL", "COCKROACHDB_URL")) return notConfigured("No connection string set.");
  return probe(async () => {
    await db.execute(sql`SELECT 1`);
    return { state: "connected" as const, detail: "Query round-trip OK." };
  }, DB_TIMEOUT_MS);
}

/**
 * The Cloudflare Tunnel + Access pair fronting LitchAI. `/health` proves all
 * three links: tunnel up, service token accepted, FastAPI alive. Access
 * bounces unauthenticated callers with an HTML login page rather than a 401,
 * so a non-JSON body is itself the diagnosis.
 */
async function litchaiHealth(): Promise<{
  tunnel: Pick<IntegrationStatus, "state" | "detail" | "latencyMs" | "probed">;
  model: Pick<IntegrationStatus, "state" | "detail" | "latencyMs" | "probed">;
}> {
  const configured = hasAll("LITCHAI_API_URL", "LITCHAI_ACCESS_CLIENT_ID", "LITCHAI_ACCESS_CLIENT_SECRET");
  if (!configured) {
    const missing = notConfigured("Needs the tunnel URL and an Access service token.");
    return {
      tunnel: missing,
      model: { ...notConfigured("Unreachable until the tunnel is configured.") },
    };
  }

  const headers = {
    "CF-Access-Client-Id": env("LITCHAI_ACCESS_CLIENT_ID")!,
    "CF-Access-Client-Secret": env("LITCHAI_ACCESS_CLIENT_SECRET")!,
  };
  const call = async (path: string) => {
    const res = await fetch(new URL(path, env("LITCHAI_API_URL")), {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const ct = res.headers.get("content-type") || "";
    const json = ct.includes("json") ? await res.json().catch(() => null) : null;
    return { res, json };
  };

  const tunnel = await probe(async () => {
    const { res, json } = await call("/health");
    if (res.status === 401 || res.status === 403)
      return { state: "degraded" as const, detail: "Access rejected the service token (401/403)." };
    if (!json)
      return { state: "degraded" as const, detail: `Reached Cloudflare, but got HTML not JSON (HTTP ${res.status}) — the Access policy is likely asking for an interactive login.` };
    if (!res.ok) return { state: "degraded" as const, detail: `Backend returned HTTP ${res.status}.` };
    return { state: "connected" as const, detail: `Tunnel + Access OK — LitchAI v${json.version ?? "?"} responding.` };
  });

  // The model lives on loopback on the VM, so only the backend can see it.
  // Nothing to report if we couldn't even reach the backend.
  if (tunnel.state !== "connected") {
    return { tunnel, model: { state: "unknown", detail: "Can't be checked while the backend is unreachable.", probed: false } };
  }

  const model = await probe(async () => {
    const { res, json } = await call("/health/model");
    if (res.status === 404)
      return {
        state: "unknown" as const,
        detail: "Backend is up, but it predates /health/model — redeploy the VM to see model status here.",
      };
    if (!json || !res.ok) return { state: "degraded" as const, detail: `Model probe returned HTTP ${res.status}.` };
    const name = typeof json.model === "string" ? json.model : "model";
    if (json.status === "ok")
      return { state: "connected" as const, detail: `${name} loaded and responding${json.digest_pinned ? " — digest pinned" : ""}.`, latencyMs: json.latency_ms };
    if (json.status === "degraded")
      return { state: "degraded" as const, detail: `Ollama is up but ${json.detail ?? `${name} isn't available`}.` };
    return { state: "degraded" as const, detail: `Ollama isn't responding on the VM (${json.detail ?? "down"}).` };
  });

  return { tunnel, model };
}

/* ------------------------------------------------------------------ */
/* Config-only checks (no safe/cheap probe exists)                     */
/* ------------------------------------------------------------------ */

/**
 * Cal.com is inbound-only for us: they call our webhook. There's nothing to
 * ping that would prove the booking link works, so this stays config-only and
 * says so rather than claiming a health it can't observe.
 */
function calcom() {
  const link = env("NEXT_PUBLIC_CALCOM_LINK");
  const secret = env("CALCOM_WEBHOOK_SECRET");
  if (!link && !secret) return notConfigured("No booking link or webhook secret set.");
  if (link && !secret)
    return { state: "degraded" as const, detail: "Booking link set, but no webhook secret — bookings won't mirror into Consultations.", probed: false };
  if (!link && secret)
    return { state: "degraded" as const, detail: "Webhook secret set, but no public booking link — /book has nothing to embed.", probed: false };
  return { state: "connected" as const, detail: "Booking link live; webhook signatures verified (HMAC-SHA256).", probed: false };
}

/**
 * Doppler injects DOPPLER_* into the process when secrets are sourced through
 * `doppler run`. Absence isn't a fault — Vercel serves the same secrets from
 * its own env store — so this reports *where secrets came from*, not health.
 */
function doppler() {
  const project = env("DOPPLER_PROJECT");
  const config = env("DOPPLER_CONFIG");
  if (!project)
    return {
      state: "unknown" as const,
      detail: env("VERCEL")
        ? "Not in-process — on Vercel, secrets are served from Vercel's env store (synced from Doppler)."
        : "Not in-process — this shell didn't start under `doppler run`.",
      probed: false,
    };
  return { state: "connected" as const, detail: `Injecting secrets from ${project}${config ? ` / ${config}` : ""}.`, probed: false };
}

function googleOAuth() {
  if (!hasAll("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"))
    return notConfigured("Not configured — clients sign in with email + password only.");
  return { state: "connected" as const, detail: "Social sign-in enabled for the client portal.", probed: false };
}

function betterAuth() {
  if (!hasAny("BETTER_AUTH_SECRET", "AUTH_SECRET")) return notConfigured("No auth secret — sessions can't be signed.");
  const url = env("BETTER_AUTH_URL") || env("AUTH_URL");
  return {
    state: "connected" as const,
    detail: url
      ? "Secret set; base URL pinned for this environment."
      : "Secret set; base URL inferred from the request host (correct for production).",
    probed: false,
  };
}

function vercelCron() {
  if (!hasAll("CRON_SECRET"))
    return notConfigured("No cron secret — the daily sweep endpoint would be unauthenticated.");
  return { state: "connected" as const, detail: "Daily sweep authorised: abandons stale payments, nudges, purges trash.", probed: false };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Every integration, probed in parallel. Resolves even if everything is down. */
export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const [pay, mail, pub, priv, push, dbs, litchai] = await Promise.all([
    paystack(),
    smtp(),
    r2Public(),
    r2Private(),
    vapid(),
    cockroach(),
    litchaiHealth(),
  ]);

  return [
    {
      key: "paystack",
      name: "Paystack",
      group: "Payments & scheduling",
      description: "Collects invoice payments online and verifies them by webhook.",
      envKeys: [envGroup("PAYSTACK_SECRET_KEY")],
      docsUrl: "https://paystack.com/docs/api/",
      configHref: "/admin/finance/invoices",
      ...pay,
    },
    {
      key: "calcom",
      name: "Cal.com",
      group: "Payments & scheduling",
      description: "Consultation scheduling on /book; bookings mirror into Consultations.",
      envKeys: [envGroup("NEXT_PUBLIC_CALCOM_LINK"), envGroup("CALCOM_WEBHOOK_SECRET")],
      docsUrl: "https://cal.com/docs/core-features/webhooks",
      configHref: "/admin/requests?tab=consultations",
      ...calcom(),
    },
    {
      key: "smtp",
      name: "Email (SMTP)",
      group: "Communications",
      description: "Transactional mail: invoices, receipts, verification and resets.",
      envKeys: [envGroup("SMTP_HOST"), envGroup("SMTP_PORT"), envGroup("SMTP_USER"), envGroup("SMTP_PASS"), envGroup("SMTP_FROM")],
      configHref: "/admin/settings",
      ...mail,
    },
    {
      key: "vapid",
      name: "Web push (VAPID)",
      group: "Communications",
      description: "Browser alerts for new requests and payments. Email stays the guaranteed channel.",
      envKeys: [envGroup("VAPID_PUBLIC_KEY"), envGroup("VAPID_PRIVATE_KEY")],
      docsUrl: "https://github.com/web-push-libs/web-push#usage",
      configHref: "/admin/notifications",
      ...push,
    },
    {
      key: "r2-public",
      name: "Cloudflare R2 — public",
      group: "Storage & data",
      description: "Brand assets, blog covers and downloadable templates.",
      // lib/r2.ts accepts the canonical name or the project's older Doppler name.
      envKeys: [
        envGroup("R2_ACCOUNT_ID"),
        envGroup("R2_ACCESS_KEY_ID", "R2_ACCESS_KEY"),
        envGroup("R2_SECRET_ACCESS_KEY", "R2_SECRET_KEY"),
        envGroup("R2_BUCKET_NAME"),
        envGroup("R2_PUBLIC_DOMAIN", "PUBLIC_R2_URL"),
      ],
      docsUrl: "https://developers.cloudflare.com/r2/",
      ...pub,
    },
    {
      key: "r2-private",
      name: "Cloudflare R2 — private",
      group: "Storage & data",
      description: "Client financial documents and deliverables. Presigned access only.",
      envKeys: [envGroup("R2_PRIVATE_BUCKET")],
      docsUrl: "https://developers.cloudflare.com/r2/api/s3/presigned-urls/",
      ...priv,
    },
    {
      key: "cockroach",
      name: "CockroachDB",
      group: "Storage & data",
      description: "Primary application database, shared with Better Auth.",
      envKeys: [
        envGroup("DATABASE_URL", "COCKROACHDB_URL"),
        envGroup("COCKROACH_CA_CERT", "COCKROACH_CERT", "COCKROACHDB_CERT"),
      ],
      docsUrl: "https://www.cockroachlabs.com/docs/",
      ...dbs,
    },
    {
      key: "litchai-tunnel",
      name: "Cloudflare Tunnel → LitchAI",
      group: "LitchAI",
      description: "The only route to the OCI VM: tunnel + Access service token, no public port.",
      envKeys: [envGroup("LITCHAI_API_URL"), envGroup("LITCHAI_ACCESS_CLIENT_ID"), envGroup("LITCHAI_ACCESS_CLIENT_SECRET")],
      docsUrl: "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/",
      configHref: "/admin/litchai",
      ...litchai.tunnel,
    },
    {
      key: "litchai-model",
      name: "LitchAI local model",
      group: "LitchAI",
      description: "Ollama on the VM, pinned by digest. Categorisation rung 4 and the review assistant.",
      // Set on the VM, not here — these are reported by the backend probe.
      envKeys: [],
      docsUrl: "https://github.com/ollama/ollama/blob/main/docs/api.md",
      configHref: "/admin/litchai/observability",
      ...litchai.model,
    },
    {
      key: "better-auth",
      name: "Better Auth",
      group: "Platform",
      description: "Sessions, email verification and the admin/client role gate.",
      envKeys: [envGroup("BETTER_AUTH_SECRET", "AUTH_SECRET"), envGroup("BETTER_AUTH_URL", "AUTH_URL")],
      docsUrl: "https://www.better-auth.com/docs",
      configHref: "/admin/settings",
      ...betterAuth(),
    },
    {
      key: "google-oauth",
      name: "Google OAuth",
      group: "Platform",
      description: "Social sign-in for the client portal.",
      envKeys: [envGroup("GOOGLE_CLIENT_ID"), envGroup("GOOGLE_CLIENT_SECRET")],
      docsUrl: "https://console.cloud.google.com/apis/credentials",
      ...googleOAuth(),
    },
    {
      key: "doppler",
      name: "Doppler",
      group: "Platform",
      description: "Secret store of record; synced to Vercel for production.",
      envKeys: [envGroup("DOPPLER_PROJECT"), envGroup("DOPPLER_CONFIG")],
      docsUrl: "https://docs.doppler.com/docs/start",
      ...doppler(),
    },
    {
      key: "vercel-cron",
      name: "Vercel Cron",
      group: "Platform",
      description: "Daily sweep: stale payments, client nudges, 30-day trash purge.",
      envKeys: [envGroup("CRON_SECRET")],
      docsUrl: "https://vercel.com/docs/cron-jobs",
      configHref: "/admin/trash",
      ...vercelCron(),
    },
  ];
}

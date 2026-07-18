/**
 * Sync app env vars to the Vercel project (production + preview + development).
 * Run: node --env-file=.env.local scripts/vercel-sync-env.mjs
 * Values are read from process.env (never printed). BETTER_AUTH_URL and the
 * deployment tokens are intentionally NOT synced (Better Auth infers the URL
 * from the request host in prod).
 */
const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("Missing VERCEL_TOKEN");
  process.exit(1);
}
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const API = "https://api.vercel.com";

// Only what the WEB APP reads at runtime. Deliberately excluded: BETTER_AUTH_URL
// (localhost), deployment/infra credentials (VERCEL_TOKEN, GITHUB_PAT,
// CLOUDFLARE_*, OCI_*, LITCH_SSH_*) and LITCHAI_DATABASE_URL — those belong to
// the VM/CI, and shipping them to the app would widen the blast radius for no
// benefit. Anything the app calls `process.env.X` for MUST be listed here or it
// silently degrades in prod (this is how Sage shipped with LITCHAI_API_URL unset).
const KEYS = [
  "COCKROACHDB_URL",
  "COCKROACHDB_CERT",
  "PUBLIC_R2_URL",
  "R2_ACCESS_KEY",
  "R2_SECRET_KEY",
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "R2_PRIVATE_BUCKET",
  "BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "CONTACT_TO_EMAIL",
  "CONTACT_FROM_EMAIL",
  // LitchAI / Sage — the relay is gated on these; without them Sage reports
  // "not configured" in production.
  "LITCHAI_API_URL",
  "LITCHAI_ACCESS_CLIENT_ID",
  "LITCHAI_ACCESS_CLIENT_SECRET",
  "LITCHAI_PUBLIC_KEY",
  // Invoice issuer / bank block, push, crons.
  "INVOICE_FROM_EMAIL",
  "INVOICE_BANK_NAME",
  "INVOICE_ACCOUNT_NAME",
  "INVOICE_ACCOUNT_NUMBER",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "CRON_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "PAYSTACK_SECRET_KEY",
  "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
  // Cal.com — booking modal (public link) + webhook that mirrors bookings into
  // the consultation table. Both degrade gracefully when unset (the CTA falls
  // back to the /book page), but must be listed here to reach prod.
  "NEXT_PUBLIC_CALCOM_LINK",
  "CALCOM_WEBHOOK_SECRET",
];

async function findProject() {
  // Personal scope first
  let res = await fetch(`${API}/v9/projects?limit=100`, { headers: H });
  let data = await res.json();
  let match = (data.projects || []).find((p) => /litch/i.test(p.name));
  if (match) return { project: match, teamId: undefined };

  // Then each team
  const teamsRes = await fetch(`${API}/v2/teams`, { headers: H });
  const teams = (await teamsRes.json()).teams || [];
  for (const t of teams) {
    res = await fetch(`${API}/v9/projects?limit=100&teamId=${t.id}`, { headers: H });
    data = await res.json();
    match = (data.projects || []).find((p) => /litch/i.test(p.name));
    if (match) return { project: match, teamId: t.id };
  }
  return null;
}

async function main() {
  const found = await findProject();
  if (!found) {
    console.error("No project matching /litch/ found for this token.");
    process.exit(1);
  }
  const { project, teamId } = found;
  const teamQ = teamId ? `&teamId=${teamId}` : "";
  console.log(`Project: ${project.name} (${project.id})${teamId ? ` team ${teamId}` : " personal"}`);

  for (const key of KEYS) {
    const value = process.env[key];
    if (value == null || value === "") {
      console.log(`  – skip ${key} (unset)`);
      continue;
    }
    const res = await fetch(`${API}/v10/projects/${project.id}/env?upsert=true${teamQ}`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        key,
        value,
        type: "encrypted",
        target: ["production", "preview", "development"],
      }),
    });
    console.log(`  ${res.ok ? "✓" : "✗ " + res.status} ${key}`);
    if (!res.ok) console.error("    ", (await res.json())?.error?.message);
  }
  console.log("Done.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

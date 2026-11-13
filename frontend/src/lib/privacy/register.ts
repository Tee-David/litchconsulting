/**
 * Record of processing activities (NDPA 2023, s.29 / GAID 2025 art. 29).
 *
 * A typed config, not a database table: it changes when the product changes,
 * so it lives in git beside the code it describes and is reviewed with it.
 * Rendered read-only at /admin/settings/privacy, and the processor list in the
 * public privacy policy (lib/content.ts) must agree with PROCESSORS here.
 */

export type LawfulBasis = "contract" | "legal-obligation" | "legitimate-interest" | "consent";

export const LAWFUL_BASIS: Record<LawfulBasis, string> = {
  contract: "Performance of a contract (the engagement you asked for)",
  "legal-obligation": "Legal obligation (tax, accounting and anti-fraud record keeping)",
  "legitimate-interest": "Legitimate interest (running and securing the service)",
  consent: "Consent (you can withdraw it at any time)",
};

export type Processor = {
  id: string;
  name: string;
  role: string;
  location: string;
  transferSafeguard: string;
};

export const PROCESSORS: Processor[] = [
  { id: "vercel", name: "Vercel Inc.", role: "Hosting of the website and web app", location: "Global edge; functions in the EU/US", transferSafeguard: "Standard contractual clauses (DPA)" },
  { id: "cockroach", name: "Cockroach Labs (CockroachDB Cloud)", role: "Primary database", location: "Cloud region set on the cluster", transferSafeguard: "Standard contractual clauses (DPA); encrypted at rest and in transit" },
  { id: "r2", name: "Cloudflare R2", role: "Document, deliverable and backup storage (private bucket)", location: "Cloudflare network", transferSafeguard: "Cloudflare DPA; private bucket, signed links only" },
  { id: "workers-ai", name: "Cloudflare Workers AI", role: "AI model inference (masked data only)", location: "Cloudflare network", transferSafeguard: "Cloudflare DPA; client identifiers masked before sending; per-client local-only option" },
  { id: "groq", name: "Groq Inc.", role: "AI model inference, first in the chain (masked data only)", location: "United States", transferSafeguard: "Groq terms (no training on API data); masking; per-client local-only option" },
  { id: "cerebras", name: "Cerebras Systems", role: "AI model inference fallback (masked data only)", location: "United States", transferSafeguard: "Provider terms; masking; per-client local-only option" },
  { id: "sambanova", name: "SambaNova Systems", role: "AI model inference fallback (masked data only)", location: "United States", transferSafeguard: "Provider terms; masking; per-client local-only option" },
  { id: "oci", name: "Oracle Cloud (OCI) VM run by Litch", role: "LitchAI document pipeline and local models (llama-server)", location: "OCI region of the VM", transferSafeguard: "Operated by Litch; reachable only through Cloudflare Access" },
  { id: "paystack", name: "Paystack (Stripe)", role: "Card payments", location: "Nigeria", transferSafeguard: "PCI-DSS; Litch never sees card numbers" },
  { id: "truehost", name: "Truehost", role: "Email sending (SMTP)", location: "Kenya / Nigeria", transferSafeguard: "Contract terms; TLS" },
  { id: "google", name: "Google LLC", role: "Optional \"Continue with Google\" sign-in", location: "Global", transferSafeguard: "Google API terms; only name and email are received" },
  { id: "calcom", name: "Cal.com", role: "Consultation booking calendar (only if you allow it)", location: "EU / US", transferSafeguard: "Cal.com DPA; loads only after consent" },
];

export type Activity = {
  id: string;
  name: string;
  purpose: string;
  subjects: string;
  categories: string[];
  basis: LawfulBasis;
  processors: string[];
  /** The policy. */
  retention: string;
  /** How the policy is applied today: automatically, or by a person. Keep this honest. */
  enforcement: string;
  where: string;
};

export const ACTIVITIES: Activity[] = [
  {
    id: "accounts",
    name: "Accounts and sign-in",
    purpose: "Let clients, staff and admins sign in securely, with two-step sign-in for the firm.",
    subjects: "Clients, client colleagues, staff, admins",
    categories: ["Name", "Email", "Password hash", "Authenticator secret (encrypted)", "Sessions: IP address, device"],
    basis: "contract",
    processors: ["vercel", "cockroach", "google", "truehost"],
    retention: "While the account is open; sessions expire after 7 days; sign-in history kept with the audit log.",
    enforcement: "Sessions expire automatically. Accounts are deleted by an Admin (Settings → Team and access) or on an erasure request.",
    where: "user, account, session, twoFactor, session_two_step",
  },
  {
    id: "engagements",
    name: "Client engagements (requests)",
    purpose: "Quote, deliver and track the services a client asks for.",
    subjects: "Clients and their colleagues",
    categories: ["Company details (RC, TIN, address)", "Brief and answers", "Messages", "Status history"],
    basis: "contract",
    processors: ["vercel", "cockroach", "truehost"],
    retention: "6 years after the engagement ends (financial records), then erased.",
    enforcement: "Manual: an Admin reviews closed engagements yearly. Trash is purged automatically 30 days after deletion; erasure requests run after a 30-day hold (nightly sweep).",
    where: "client, service_request, request_item, review_round, ticket",
  },
  {
    id: "documents",
    name: "Client financial documents and deliverables",
    purpose: "Prepare reports, tax computations and analyses from the documents a client uploads.",
    subjects: "Clients; people named in their records (employees, customers, suppliers)",
    categories: ["Financial statements, ledgers, bank statements", "Payroll data where supplied", "Deliverables"],
    basis: "contract",
    processors: ["r2", "oci", "groq", "workers-ai", "cerebras", "sambanova"],
    retention: "6 years after the engagement ends; erasure on request after a 30-day hold unless the law requires us to keep them.",
    enforcement: "Erasure requests run automatically after the hold (nightly sweep). The 6-year limit is reviewed manually.",
    where: "R2 private bucket; service_request_document; LitchAI VM",
  },
  {
    id: "ai",
    name: "AI-assisted analysis (Sage and the workbench)",
    purpose: "Speed up analysis and answer questions over the firm's knowledge and client files.",
    subjects: "Clients and people named in their records",
    categories: ["Masked samples of client figures and text", "Prompts and answers"],
    basis: "legitimate-interest",
    processors: ["oci", "groq", "workers-ai", "cerebras", "sambanova"],
    retention: "Conversations kept until deleted by an Admin. A client can be set to local-only (never leaves the VM).",
    enforcement: "Manual deletion. Masking and the local-only setting are enforced by the LitchAI router on every call.",
    where: "sage_conversation, sage_message, client.ai_mode",
  },
  {
    id: "billing",
    name: "Billing and payments",
    purpose: "Issue quotes, invoices and receipts and take payment.",
    subjects: "Clients",
    categories: ["Bill-to details", "Amounts", "Payment references", "Transfer proofs"],
    basis: "legal-obligation",
    processors: ["vercel", "cockroach", "paystack", "r2", "truehost"],
    retention: "6 years from the end of the financial year (tax and accounting law).",
    enforcement: "Manual review. Deleted invoices are purged from Trash after 30 days.",
    where: "invoice, invoice_item, payment",
  },
  {
    id: "notifications",
    name: "Notifications and email",
    purpose: "Tell people what needs them and what changed.",
    subjects: "All users",
    categories: ["Email address", "Notification preferences", "Push subscription"],
    basis: "contract",
    processors: ["truehost", "vercel", "cockroach"],
    retention: "Notifications and email logs: 12 months. Preferences: while the account is open.",
    enforcement: "Not yet purged automatically. Follow-up: add notification and outbox clean-up to the nightly sweep.",
    where: "notification, notification_pref, email_outbox, push_subscription",
  },
  {
    id: "audit",
    name: "Security and audit log",
    purpose: "Record consequential actions and sign-ins to protect clients and the firm.",
    subjects: "All users",
    categories: ["Who did what and when", "IP address and device for sign-ins"],
    basis: "legitimate-interest",
    processors: ["cockroach"],
    retention: "6 years (alongside the financial records it explains).",
    enforcement: "Manual review.",
    where: "audit_log",
  },
  {
    id: "leads",
    name: "Website enquiries and newsletter",
    purpose: "Answer enquiries and send the newsletter people asked for.",
    subjects: "Website visitors",
    categories: ["Name", "Email", "Company", "Message"],
    basis: "consent",
    processors: ["vercel", "cockroach", "truehost", "calcom"],
    retention: "2 years from the last contact, or until the person unsubscribes.",
    enforcement: "Manual review. Unsubscribe links stop emails at once.",
    where: "lead, consultation",
  },
  {
    id: "backups",
    name: "Backups",
    purpose: "Recover the service after a failure.",
    subjects: "All of the above",
    categories: ["Full database copies"],
    basis: "legitimate-interest",
    processors: ["r2"],
    retention: "Nightly copies; erased records drop out when old copies are removed.",
    enforcement: "Not yet rotated automatically: old copies are removed by hand. Follow-up: add rotation to the backup cron. User, session and account tables are not included in backups.",
    where: "R2 private bucket (backups/db/)",
  },
];

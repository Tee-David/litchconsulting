/**
 * QA demo data: three test logins (admin, staff, client) and a realistic set of
 * clients, requests, files, invoices, payments, tickets, notes and expenses, so
 * every dashboard has real work to do. Every row is marked so `remove` can
 * delete it all again, including the files in private R2.
 *
 *   node --env-file=.env.local --import tsx scripts/demo-seed.mts seed <filesDir>
 *   node --env-file=.env.local --import tsx scripts/demo-seed.mts remove
 *
 * `seed` prints the three passwords once. It refuses to run twice (remove first).
 * The demo files come from a folder of real xlsx/csv/json/docx/txt/pdf files.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";
import { S3Client, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const MARK = "[QA demo]";
const USERS = {
  admin: { email: "qa.admin@example.com", name: "Ngozi Eze (QA admin)", role: "admin" },
  staff: { email: "qa.staff@example.com", name: "Tunde Bakare (QA staff)", role: "staff" },
  client: { email: "qa.client@example.com", name: "Aisha Kanem (QA client)", role: "client" },
} as const;
const OKONKWO_EMAIL = "chidi.okonkwo@example.com";

const [mode, filesDir] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL, ssl: { ca: fs.readFileSync("certs/cockroach-ca.crt", "utf8") } });
const q = (s: string, v: unknown[] = []) => pool.query(s, v);

const bucket = process.env.R2_PRIVATE_BUCKET!;
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: (process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY)!, secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY)! },
});
const TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv", json: "application/json", txt: "text/plain", pdf: "application/pdf",
};
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");

async function put(prefix: string, file: string) {
  const body = fs.readFileSync(path.join(filesDir, file));
  const ext = file.split(".").pop()!;
  const key = `${prefix}${Date.now()}-${slug(file)}`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: TYPES[ext] }));
  return { key, size: body.length, type: TYPES[ext] };
}

const D = 86_400_000;
const at = (days: number, hour = 10) => { const d = new Date(Date.now() + days * D); d.setHours(hour, 0, 0, 0); return d; };
const day = (days: number) => at(days).toISOString().slice(0, 10);
const year = new Date().getFullYear();

async function nextNumber(table: string, prefix: string, width = 3, start = 0) {
  const rows = (await q(`SELECT number FROM ${table} WHERE number LIKE $1`, [`${prefix}%`])).rows as { number: string }[];
  let max = start;
  for (const r of rows) { const n = parseInt(r.number.slice(prefix.length), 10); if (Number.isFinite(n) && n > max) max = n; }
  return () => `${prefix}${String(++max).padStart(width, "0")}`;
}

async function seed() {
  if (!filesDir || !fs.existsSync(filesDir)) throw new Error("Give the folder with the demo files.");
  const exists = (await q(`SELECT count(*)::int n FROM "user" WHERE email = ANY($1)`, [Object.values(USERS).map((u) => u.email)])).rows[0].n;
  if (Number(exists) > 0) throw new Error("Demo users already exist. Run `remove` first.");

  // 1. Users (verified; admin and staff enrol two-step on first sign-in)
  const ids: Record<string, string> = {};
  const passwords: Record<string, string> = {};
  const now = new Date();
  for (const [role, u] of Object.entries(USERS)) {
    const id = randomUUID();
    const pw = `Qa-${role}-${randomBytes(6).toString("base64url")}!7`;
    await q(`INSERT INTO "user" (id,name,email,"emailVerified",role,banned,"createdAt","updatedAt") VALUES ($1,$2,$3,true,$4,false,$5,$5)`, [id, u.name, u.email, u.role, now]);
    await q(`INSERT INTO account (id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES ($1,$2,'credential',$2,$3,$4,$4)`, [randomUUID(), id, await hashPassword(pw), now]);
    ids[role] = id;
    passwords[role] = pw;
  }
  const admin = USERS.admin.name, staff = USERS.staff.name;

  // 2. Clients
  const kanem = randomUUID(), okonkwo = randomUUID();
  await q(`INSERT INTO client (id,user_id,name,company,email,phone,address,tax_id,notes,ai_mode) VALUES ($1,$2,'Aisha Kanem','Kanem Logistics Nigeria Ltd',$3,'+234 803 000 1458','Plot 14 Kano Road, Maiduguri, Borno','TIN 18820317-0001 · RC 1458221',$4,'cloud_masked')`,
    [kanem, ids.client, USERS.client.email, `${MARK} Haulage company, 3 depots. Prefers WhatsApp for quick questions, email for documents.`]);
  await q(`INSERT INTO client (id,name,company,email,phone,address,tax_id,notes,ai_mode,ai_mode_reason,ai_mode_set_by,ai_mode_set_at) VALUES ($1,'Chidi Okonkwo','Okonkwo Agro-Allied Ltd',$2,'+234 805 000 2207','12 Aba Road, Umuahia, Abia','TIN 22107845-0001 · RC 902114',$3,'local_only','Board asked that no financial data leaves Litch systems.',$4,$5)`,
    [okonkwo, OKONKWO_EMAIL, `${MARK} Poultry feed mill. No portal login yet; all contact is by email.`, admin, at(-30)]);

  const REQ = await nextNumber("service_request", `REQ-${year}-`);
  const INV = await nextNumber("invoice", `INV-${year}-`);
  const QUO = await nextNumber("invoice", `QUO-${year}-`);
  const TKT = await nextNumber("ticket", "TKT-", 0, 1000);

  async function request(r: { client: string; user: string; slug: string; name: string; status: string; details: string; created: number; assigned?: boolean; round?: number; completed?: number }) {
    const id = randomUUID();
    await q(`INSERT INTO service_request (id,number,client_id,user_id,service_slug,service_name,pricing_mode,currency,status,details,review_round,completed_at,delivered_at,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,'quote','NGN',$7,$8,$9,$10,$10,$11,$12)`,
      [id, REQ(), r.client, r.user, r.slug, r.name, r.status, r.details, r.round ?? 0, r.completed != null ? at(r.completed) : null, at(r.created), at(Math.max(r.created, -1))]);
    if (r.assigned) {
      await q(`INSERT INTO request_assignment (request_id,user_id,assigned_by) VALUES ($1,$2,$3)`, [id, ids.staff, ids.admin]);
      await q(`UPDATE service_request SET assignee=$2 WHERE id=$1`, [id, staff]);
    }
    await event(id, "created", null, "quote_requested", "Request received.", "client", USERS.client.name, r.created);
    return id;
  }
  async function event(requestId: string, type: string, from: string | null, to: string | null, message: string, role: string, actor: string, days: number, visibility = "client") {
    await q(`INSERT INTO service_request_event (request_id,type,from_status,to_status,message,visibility,actor_role,actor_name,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [requestId, type, from, to, message, visibility, role, actor, at(days)]);
  }
  async function doc(requestId: string, file: string, o: { kind?: string; stage?: string; by?: string; byName?: string; days: number }) {
    const f = await put(`requests/${requestId}/`, file);
    const id = randomUUID();
    await q(`INSERT INTO service_request_document (id,request_id,kind,file_name,content_type,size_bytes,r2_key,uploaded_by_role,uploaded_by_name,stage,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, requestId, o.kind ?? "client_upload", file, f.type, f.size, f.key, o.by ?? "client", o.byName ?? USERS.client.name, o.stage ?? null, at(o.days)]);
    return id;
  }
  async function invoice(o: { kind?: string; status: string; client: string; company: string; name: string; email: string; title: string; issued: number; due: number; lines: [string, number][]; paid?: number; deposit?: number; sent?: number; paidAt?: number }) {
    const id = randomUUID();
    const sub = o.lines.reduce((s, l) => s + l[1], 0), tax = Math.round(sub * 7.5) / 100, total = sub + tax;
    const number = o.kind === "quote" ? QUO() : INV();
    await q(`INSERT INTO invoice (id,number,kind,status,client_id,bill_to_name,bill_to_company,bill_to_email,project_title,currency,issue_date,due_date,public_token,subtotal,tax_total,total,amount_paid,deposit_percent,created_by_user_id,sent_at,paid_at,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'NGN',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21)`,
      [id, number, o.kind ?? "invoice", o.status, o.client, o.name, o.company, o.email, o.title, day(o.issued), day(o.due), randomBytes(18).toString("base64url"), sub.toFixed(2), tax.toFixed(2), total.toFixed(2), (o.paid ?? 0).toFixed(2), o.deposit ?? null, ids.admin, o.sent != null ? at(o.sent) : null, o.paidAt != null ? at(o.paidAt) : null, at(o.issued)]);
    for (const [i, [desc, amt]] of o.lines.entries())
      await q(`INSERT INTO invoice_item (invoice_id,description,quantity,unit_price,tax_rate,amount,position) VALUES ($1,$2,1,$3,7.5,$3,$4)`, [id, desc, amt.toFixed(2), i]);
    return { id, number, total };
  }
  async function payment(o: { invoice: { id: string; number: string }; request?: string; client: string; amount: number; status: string; channel: string; provider: string; days: number; proof?: string }) {
    let proofKey: string | null = null;
    if (o.proof) proofKey = (await put(`payments/${o.invoice.id}/`, o.proof)).key;
    await q(`INSERT INTO payment (reference,provider,invoice_id,request_id,client_id,status,amount,amount_settled,currency,channel,paid_at,verified_at,proof_key,proof_file_name,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'NGN',$9,$10,$10,$11,$12,$13,$13)`,
      [`LC-${o.invoice.number}-${randomBytes(3).toString("hex")}`, o.provider, o.invoice.id, o.request ?? null, o.client, o.status, o.amount.toFixed(2), o.status === "success" ? o.amount.toFixed(2) : null, o.channel, o.status === "success" ? at(o.days) : null, proofKey, o.proof ?? null, at(o.days)]);
  }
  async function ask(requestId: string, o: { kind: string; title: string; detail: string; status: string; due?: number; documentId?: string; supplied?: number; days: number }) {
    await q(`INSERT INTO request_item (request_id,kind,title,detail,status,due_at,document_id,created_by,supplied_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
      [requestId, o.kind, o.title, o.detail, o.status, o.due != null ? at(o.due, 17) : null, o.documentId ?? null, staff, o.supplied != null ? at(o.supplied) : null, at(o.days)]);
  }
  const K = { client: kanem, company: "Kanem Logistics Nigeria Ltd", name: "Aisha Kanem", email: USERS.client.email };
  const O = { client: okonkwo, company: "Okonkwo Agro-Allied Ltd", name: "Chidi Okonkwo", email: OKONKWO_EMAIL };

  // R1 — FY2025 statutory accounts: in progress, files at several stages, asks open/supplied.
  const r1 = await request({ client: kanem, user: ids.client, slug: "financial-reporting", name: "FY2025 statutory accounts", status: "in_progress", created: -21, assigned: true,
    details: "Prepare our FY2025 financial statements (IFRS for SMEs) and the CIT computation. Trial balance and cash book attached. Board wants a draft by 15 January." });
  const i1 = await invoice({ ...K, status: "paid", title: "FY2025 statutory accounts", issued: -19, due: -5, sent: -19, paidAt: -17, lines: [["Preparation of FY2025 financial statements", 1_800_000], ["CIT and Development Levy computation", 350_000]] });
  await q(`UPDATE invoice SET amount_paid = total WHERE id=$1`, [i1.id]);
  await q(`UPDATE service_request SET invoice_id=$2 WHERE id=$1`, [r1, i1.id]);
  await payment({ invoice: i1, request: r1, client: kanem, amount: i1.total, status: "success", channel: "card", provider: "paystack", days: -17 });
  await event(r1, "status", "pending_payment", "awaiting_documents", "Payment received. Upload your documents.", "system", "Litch", -17);
  await event(r1, "status", "awaiting_documents", "in_progress", "Work started.", "admin", staff, -12);
  await event(r1, "note", null, null, "TB balances. Cash book has two cheques not yet on the bank statement.", "admin", staff, -8, "internal");
  await doc(r1, "Kanem_Trial_Balance_FY2025.xlsx", { days: -18 });
  await doc(r1, "Kanem_Cash_Book_Oct2025.xlsx", { days: -18 });
  await doc(r1, "Kanem_Fixed_Asset_Register_2025.docx", { days: -14 });
  await doc(r1, "Kanem_Board_Minutes_Nov2025.txt", { days: -2 });
  const bank = await doc(r1, "Kanem_Bank_Statement_Oct2025.csv", { days: -1 });
  await ask(r1, { kind: "document", title: "October 2025 bank statement (GTBank)", detail: "CSV or PDF export from internet banking.", status: "supplied", documentId: bank, supplied: -1, days: -10 });
  await ask(r1, { kind: "info", title: "Confirm the cut-off date for fixed asset additions", detail: "Is 31 December 2025 the cut-off? Was truck KAN-412-XA written off after the August accident?", status: "open", due: 3, days: -4 });
  await ask(r1, { kind: "document", title: "October 2025 payroll schedule", detail: "One row per employee with gross pay. A spreadsheet is best.", status: "open", due: 5, days: -4 });

  // R2 — Q3 VAT and WHT review: draft with the client, part paid, transfer proof waiting.
  const r2 = await request({ client: kanem, user: ids.client, slug: "taxation-planning-management", name: "Q3 2025 VAT and WHT review", status: "client_review", created: -30, assigned: true, round: 1,
    details: "Check our Q3 VAT and WHT before we file. Vendor payments and sales listing attached." });
  const i2 = await invoice({ ...K, status: "partially_paid", title: "Q3 2025 VAT and WHT review", issued: -28, due: -1, sent: -28, deposit: 50, lines: [["VAT and WHT review, Q3 2025", 900_000]] });
  await q(`UPDATE invoice SET amount_paid = round(total/2, 2) WHERE id=$1`, [i2.id]);
  await q(`UPDATE service_request SET invoice_id=$2 WHERE id=$1`, [r2, i2.id]);
  await payment({ invoice: i2, request: r2, client: kanem, amount: Math.round(i2.total * 50) / 100, status: "success", channel: "card", provider: "paystack", days: -27 });
  await payment({ invoice: i2, request: r2, client: kanem, amount: i2.total - Math.round(i2.total * 50) / 100, status: "pending", channel: "bank_transfer", provider: "bank_transfer", days: 0, proof: "GTBank_Transfer_Receipt_INV-balance.pdf" });
  await doc(r2, "Kanem_Vendor_Payments_Q3_2025.xlsx", { days: -26 });
  await doc(r2, "Kanem_Sales_VAT_Q3_2025.csv", { days: -26 });
  const draft = await doc(r2, "Q3_2025_VAT_and_WHT_Review_DRAFT.pdf", { kind: "deliverable", stage: "draft", by: "admin", byName: staff, days: -4 });
  await q(`INSERT INTO review_round (request_id,round,document_id,sent_at) VALUES ($1,1,$2,$3)`, [r2, draft, at(-4)]);
  await event(r2, "status", "in_progress", "client_review", "Draft sent for your review.", "admin", staff, -4);

  // R3 — fuel analytics: new quote request, nobody assigned yet.
  const r3 = await request({ client: kanem, user: ids.client, slug: "data-analytics", name: "Fuel spend analytics per truck", status: "quote_requested", created: -1,
    details: "Fuel costs rose about 18% in Q3. We want cost per truck and per km before the 2026 budget. March fuel-card export attached (JSON)." });
  await doc(r3, "Kanem_Fuel_Card_March2025.json", { days: -1 });

  // R4 — completed last year: final files and a paid invoice.
  const r4 = await request({ client: kanem, user: ids.client, slug: "taxation-planning-management", name: "FY2024 company income tax computation", status: "completed", created: -150, assigned: true, completed: -128,
    details: "Compute and file our FY2024 CIT." });
  const i4 = await invoice({ ...K, status: "paid", title: "FY2024 CIT computation and filing", issued: -148, due: -134, sent: -148, paidAt: -140, lines: [["FY2024 CIT computation and filing", 650_000]] });
  await q(`UPDATE invoice SET amount_paid = total WHERE id=$1`, [i4.id]);
  await q(`UPDATE service_request SET invoice_id=$2 WHERE id=$1`, [r4, i4.id]);
  await payment({ invoice: i4, request: r4, client: kanem, amount: i4.total, status: "success", channel: "card", provider: "paystack", days: -140 });
  await doc(r4, "FY2024_Tax_Computation_FINAL.pdf", { kind: "deliverable", stage: "final", by: "admin", byName: staff, days: -129 });
  await doc(r4, "FY2024_Tax_Computation_FINAL.xlsx", { kind: "deliverable", stage: "final", by: "admin", byName: staff, days: -129 });
  await event(r4, "status", "delivered", "completed", "Filed with FIRS.", "admin", admin, -128);

  // R5 — Okonkwo cash-flow model: draft waiting for the admin's internal review.
  const r5 = await request({ client: okonkwo, user: ids.admin, slug: "financial-modelling", name: "3-year cash-flow model, feed mill expansion", status: "in_review", created: -16, assigned: true,
    details: "Build a 3-year cash-flow model for a new feed mill (capex about NGN 60m in 2026). The bank needs it for a loan application." });
  await doc(r5, "Okonkwo_Sales_2025.xlsx", { by: "admin", byName: admin, days: -15 });
  await doc(r5, "Okonkwo_Cash_Flow_Model_DRAFT.xlsx", { kind: "deliverable", stage: "draft", by: "admin", byName: staff, days: -1 });
  await event(r5, "status", "in_progress", "in_review", "Draft model ready for internal review.", "admin", staff, -1, "internal");

  // R6 — Okonkwo procurement review: quote sent 8 days ago, no answer.
  const r6 = await request({ client: okonkwo, user: ids.admin, slug: "forensic-accounting", name: "Procurement review, 2024 to 2025", status: "quote_sent", created: -10,
    details: "The board suspects inflated maize purchase prices. Review procurement for 2024 and 2025." });
  const q6 = await invoice({ ...O, kind: "quote", status: "sent", title: "Procurement review, 2024 to 2025", issued: -8, due: 7, sent: -8, lines: [["Forensic procurement review", 3_400_000], ["Report to the board", 450_000]] });
  await q(`UPDATE service_request SET invoice_id=$2 WHERE id=$1`, [r6, q6.id]);

  // Overdue retainer invoice for Okonkwo.
  await invoice({ ...O, status: "overdue", title: "Advisory retainer, September", issued: -42, due: -12, sent: -42, lines: [["Monthly advisory retainer, September", 400_000]] });

  // Tickets
  async function tkt(o: { client: string; name: string; email: string; subject: string; status: string; team: string; type: string; request?: string; msgs: [string, string, number][] }) {
    const id = randomUUID();
    const last = o.msgs[o.msgs.length - 1][2];
    await q(`INSERT INTO ticket (id,number,subject,requester_name,requester_email,client_id,status,priority,category,team,type,request_id,tags,created_at,updated_at,last_reply_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'normal','general',$8,$9,$10,$11,$12,$13,$13)`,
      [id, TKT(), o.subject, o.name, o.email, o.client, o.status, o.team, o.type, o.request ?? null, JSON.stringify(["qa-demo"]), at(o.msgs[0][2]), at(last)]);
    for (const [role, body, d] of o.msgs) await q(`INSERT INTO ticket_message (ticket_id,author_name,author_role,body,created_at) VALUES ($1,$2,$3,$4,$5)`, [id, role === "client" ? o.name : staff, role, body, at(d)]);
  }
  await tkt({ ...K, subject: "Can you also file our CAC annual return?", status: "open", team: "Advisory", type: "request", msgs: [["client", "Hello, our CAC annual return for 2025 is due. Can Litch file it for us, and what does it cost?", -1]] });
  await tkt({ ...K, subject: "Receipt for the deposit on the VAT review", status: "resolved", team: "Finance", type: "billing", request: r2, msgs: [["client", "Please send the receipt for the deposit we paid.", -26], ["agent", "Done. The receipt is in Billing, and we emailed a copy.", -26]] });
  await tkt({ ...O, subject: "New finance contact from December", status: "open", team: "Support", type: "question", msgs: [["client", "From 1 December, please send all invoices to our new finance manager, Ngozi Ibe. How do we change the contact?", 0]] });

  // Consultation, notes, expenses
  await q(`INSERT INTO consultation (cal_booking_uid,name,email,client_id,starts_at,ends_at,status,meeting_url) VALUES ($1,'Aisha Kanem',$2,$3,$4,$5,'confirmed','https://cal.com/litch-consulting/demo')`,
    [`qa-demo-${randomBytes(4).toString("hex")}`, USERS.client.email, kanem, at(3, 10), at(3, 11)]);
  await q(`INSERT INTO client_note (client_id,author_name,kind,body,created_at,updated_at) VALUES ($1,$2,'note','NDA signed in March. Aisha approves all filings herself.',$3,$3)`, [kanem, admin, at(-60)]);
  await q(`INSERT INTO client_note (client_id,author_name,kind,body,due_date,created_at,updated_at) VALUES ($1,$2,'task','Call Aisha about the late September WHT remittance and the possible penalty.',$3,$4,$4)`, [kanem, admin, day(1), at(-2)]);
  const month = new Date(); month.setDate(1); month.setMonth(month.getMonth() - 1);
  const ym = (d: number) => new Date(month.getFullYear(), month.getMonth(), d, 12).toISOString().slice(0, 10);
  const expenses: [string, string, string, number, number, number, string | null][] = [
    [ym(28), "rent", "Adeola Properties Ltd", 850_000, 0, 85_000, "Expense_Receipt_Adeola_Rent_Oct2025.pdf"],
    [ym(25), "software", "Microsoft 365 (12 seats)", 186_000, 12_976.74, 0, null],
    [ym(22), "travel", "Air Peace, Abuja return", 248_500, 17_337.21, 0, null],
    [ym(18), "software", "Oracle Cloud (AI server)", 224_000, 0, 0, null],
    [ym(15), "contractors", "IT support, Emeka Tech", 150_000, 0, 15_000, null],
  ];
  for (const [d, cat, vendor, amt, vat, wht, receipt] of expenses) {
    const id = randomUUID();
    let key: string | null = null;
    if (receipt) key = (await put(`expenses/${id}/`, receipt)).key;
    await q(`INSERT INTO expense (id,date,category,vendor,amount,vat_input,wht_deducted,currency,method,reference,receipt_key,receipt_name,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'NGN','transfer','QA-DEMO',$8,$9,$10)`,
      [id, d, cat, vendor, amt.toFixed(2), vat.toFixed(2), wht.toFixed(2), key, receipt, ids.admin]);
  }

  console.log(JSON.stringify({ users: Object.fromEntries(Object.entries(USERS).map(([r, u]) => [r, { email: u.email, password: passwords[r] }])), requests: [r1, r2, r3, r4, r5, r6].length }, null, 1));
}

async function remove() {
  const users = (await q(`SELECT id FROM "user" WHERE email = ANY($1)`, [Object.values(USERS).map((u) => u.email)])).rows.map((r) => r.id as string);
  const clients = (await q(`SELECT id FROM client WHERE notes LIKE $1`, [`${MARK}%`])).rows.map((r) => r.id as string);
  const reqs = (await q(`SELECT id FROM service_request WHERE client_id = ANY($1)`, [clients])).rows.map((r) => r.id as string);
  const invs = (await q(`SELECT id FROM invoice WHERE client_id = ANY($1)`, [clients])).rows.map((r) => r.id as string);
  const tks = (await q(`SELECT id FROM ticket WHERE client_id = ANY($1)`, [clients])).rows.map((r) => r.id as string);
  const exps = (await q(`SELECT id FROM expense WHERE reference = 'QA-DEMO'`)).rows.map((r) => r.id as string);
  // Private files: every object under the demo request, invoice and expense folders.
  const prefixes = [...reqs.map((id) => `requests/${id}/`), ...invs.map((id) => `payments/${id}/`), ...exps.map((id) => `expenses/${id}/`)];
  let files = 0;
  for (const prefix of prefixes) {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) { await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } })); files += keys.length; }
  }
  const run = async (sql: string, v: unknown[]) => (await q(sql, v)).rowCount;
  const out: Record<string, unknown> = { files };
  out.events = await run(`DELETE FROM service_request_event WHERE request_id = ANY($1)`, [reqs]);
  out.docs = await run(`DELETE FROM service_request_document WHERE request_id = ANY($1)`, [reqs]);
  out.items = await run(`DELETE FROM request_item WHERE request_id = ANY($1)`, [reqs]);
  out.rounds = await run(`DELETE FROM review_round WHERE request_id = ANY($1)`, [reqs]);
  out.assign = await run(`DELETE FROM request_assignment WHERE request_id = ANY($1) OR user_id = ANY($2)`, [reqs, users]);
  out.drafts = await run(`DELETE FROM request_draft WHERE user_id = ANY($1)`, [users]).catch(() => "skip");
  out.workbench = await run(`DELETE FROM workbench_conversation WHERE request_id = ANY($1)`, [reqs]).catch(() => "skip");
  out.payments = await run(`DELETE FROM payment WHERE invoice_id = ANY($1) OR client_id = ANY($2)`, [invs, clients]);
  out.invItems = await run(`DELETE FROM invoice_item WHERE invoice_id = ANY($1)`, [invs]);
  out.invoices = await run(`DELETE FROM invoice WHERE id = ANY($1)`, [invs]);
  out.requests = await run(`DELETE FROM service_request WHERE id = ANY($1)`, [reqs]);
  out.msgs = await run(`DELETE FROM ticket_message WHERE ticket_id = ANY($1)`, [tks]);
  out.tickets = await run(`DELETE FROM ticket WHERE id = ANY($1)`, [tks]);
  out.consults = await run(`DELETE FROM consultation WHERE client_id = ANY($1)`, [clients]);
  out.notes = await run(`DELETE FROM client_note WHERE client_id = ANY($1)`, [clients]);
  out.members = await run(`DELETE FROM client_member WHERE client_id = ANY($1) OR user_id = ANY($2)`, [clients, users]);
  out.invitations = await run(`DELETE FROM invitation WHERE client_id = ANY($1)`, [clients]).catch(() => "skip");
  out.clients = await run(`DELETE FROM client WHERE id = ANY($1)`, [clients]);
  out.expenses = await run(`DELETE FROM expense WHERE id = ANY($1)`, [exps]);
  await run(`DELETE FROM sage_message WHERE conversation_id IN (SELECT id FROM sage_conversation WHERE user_id = ANY($1))`, [users]).catch(() => null);
  for (const t of [`session_two_step WHERE user_id`, `"twoFactor" WHERE "userId"`, `session WHERE "userId"`, `account WHERE "userId"`, `user_onboarding WHERE user_id`, `notification WHERE user_id`, `notification_pref WHERE user_id`, `push_subscription WHERE user_id`, `sage_conversation WHERE user_id`, `request_draft WHERE user_id`])
    await run(`DELETE FROM ${t} = ANY($1)`, [users]).catch(() => null);
  await run(`DELETE FROM workbench_conversation WHERE request_id = ANY($1) OR client_id = ANY($2)`, [reqs, clients]).catch(() => null);
  out.audit = await run(`DELETE FROM audit_log WHERE actor_id = ANY($1) OR entity_id = ANY($1)`, [users]).catch(() => "skip");
  out.users = await run(`DELETE FROM "user" WHERE id = ANY($1)`, [users]);
  console.log("removed", JSON.stringify(out));
}

try {
  if (mode === "seed") await seed();
  else if (mode === "remove") await remove();
  else console.log("Usage: demo-seed.mts seed <filesDir> | remove");
} finally {
  await pool.end();
}

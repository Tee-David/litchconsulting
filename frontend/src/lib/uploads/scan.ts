import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { expense, payment, serviceRequestDocument } from "@/lib/db/schema";

/**
 * Virus scanning for private uploads (client documents, deliverables, transfer
 * proofs). Files go straight from the browser to private R2, so the web app
 * hands the LitchAI VM a 5-minute presigned GET and the VM streams it into
 * ClamAV (`POST /scan`). Results are stored on the row:
 *
 *   unscanned → not checked yet (every new upload)  — blocked
 *   clean     → served
 *   infected  → never served; admins are told
 *   too_large → over ClamAV's 25 MB limit — firm only, with a warning
 *   error     → scanner unreachable / failed — blocked, retried next time
 *
 * A file is scanned the first time someone opens it (a few seconds) and by the
 * nightly sweep. Without LITCHAI_API_URL (local dev) files are served unscanned.
 */
export type ScanStatus = "unscanned" | "clean" | "infected" | "too_large" | "error";

const FINAL = new Set<ScanStatus>(["clean", "infected", "too_large"]);

export const scannerConfigured = () => Boolean(process.env.LITCHAI_API_URL);

type ScanReply = { status?: string; signature?: string | null; detail?: string };

/** Ask the VM to scan one private R2 object. Never throws. */
export async function scanObject(key: string): Promise<{ status: ScanStatus; signature: string | null; detail?: string }> {
  try {
    const { presignPrivateGet } = await import("@/lib/r2");
    const url = await presignPrivateGet(key, { expiresIn: 300 });
    const { litchaiRaw } = await import("@/lib/litchai/client");
    const res = await litchaiRaw("/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return { status: "error", signature: null, detail: `scanner HTTP ${res.status}` };
    const j = (await res.json()) as ScanReply;
    const s = j.status;
    if (s === "clean" || s === "infected" || s === "too_large") return { status: s, signature: j.signature ?? null };
    return { status: "error", signature: null, detail: j.detail };
  } catch (err) {
    return { status: "error", signature: null, detail: err instanceof Error ? err.message : "scan failed" };
  }
}

async function tellAdminsInfected(what: string, signature: string | null, link: string) {
  try {
    const [{ notifyUsers, userIdsWithRole }, { recordAudit }] = await Promise.all([import("@/lib/notifications"), import("@/lib/audit")]);
    const admins = await userIdsWithRole("admin");
    await notifyUsers({
      userIds: admins,
      category: "team",
      title: "A virus was found in an upload",
      body: `${what} was blocked${signature ? ` (${signature})` : ""}. It can't be downloaded.`,
      link,
      dedupeKey: `infected:${link}`,
    });
    await recordAudit({ action: "upload.infected", entity: "upload", actorName: "virus scan", meta: { what, signature } });
  } catch (err) {
    console.error("[scan] could not notify admins:", err);
  }
}

/** Make sure a request document has a final scan result; returns its status. */
export async function ensureDocumentScanned(doc: { id: string; r2Key: string; fileName: string; requestId: string; scanStatus: string | null }): Promise<ScanStatus> {
  const current = (doc.scanStatus ?? "unscanned") as ScanStatus;
  if (FINAL.has(current)) return current;
  if (!scannerConfigured()) return current;
  const r = await scanObject(doc.r2Key);
  await db.update(serviceRequestDocument).set({ scanStatus: r.status }).where(eq(serviceRequestDocument.id, doc.id));
  if (r.status === "infected") await tellAdminsInfected(`"${doc.fileName}"`, r.signature, `/admin/requests/${doc.requestId}`);
  return r.status;
}

/** Same for a bank-transfer proof on a payment row. */
export async function ensureProofScanned(p: { id: string; proofKey: string; proofFileName: string | null; proofScanStatus: string | null }): Promise<ScanStatus> {
  const current = (p.proofScanStatus ?? "unscanned") as ScanStatus;
  if (FINAL.has(current)) return current;
  if (!scannerConfigured()) return current;
  const r = await scanObject(p.proofKey);
  await db.update(payment).set({ proofScanStatus: r.status }).where(eq(payment.id, p.id));
  if (r.status === "infected") await tellAdminsInfected(`Transfer proof "${p.proofFileName ?? "receipt"}"`, r.signature, `/admin/billing/payments?proof=${p.id}`);
  return r.status;
}

/** Same for an expense receipt. */
export async function ensureReceiptScanned(e: { id: string; receiptKey: string; receiptName: string | null; receiptScanStatus: string | null }): Promise<ScanStatus> {
  const current = (e.receiptScanStatus ?? "unscanned") as ScanStatus;
  if (FINAL.has(current)) return current;
  if (!scannerConfigured()) return current;
  const r = await scanObject(e.receiptKey);
  await db.update(expense).set({ receiptScanStatus: r.status }).where(eq(expense.id, e.id));
  if (r.status === "infected") await tellAdminsInfected(`Expense receipt "${e.receiptName ?? "receipt"}"`, r.signature, "/admin/billing/expenses");
  return r.status;
}

/**
 * Whether `status` may be downloaded by this audience. Returns null when allowed,
 * otherwise the words to show.
 */
export function downloadBlock(status: string | null, audience: "firm" | "client"): string | null {
  if (!scannerConfigured()) return null; // local dev: no scanner
  switch ((status ?? "unscanned") as ScanStatus) {
    case "clean":
      return null;
    case "too_large":
      return audience === "firm" ? null : "This file is too large for the virus check. Ask Litch to send it another way.";
    case "infected":
      return "This file was blocked because the virus check found a threat.";
    default:
      return "This file is still being checked for viruses. Try again in a minute.";
  }
}

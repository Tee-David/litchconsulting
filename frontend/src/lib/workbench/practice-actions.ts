"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workbenchConversation } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { wbGet, wbStart, wbUserEdits, type WbUserEdit } from "@/lib/litchai/workbench";

type Res = { ok: true; href: string; id: string } | { ok: false; error: string };

/**
 * The practice workbook: a sample trial balance (Kanem Logistics, invented
 * figures) that a learner can edit, format and ask Sage about. It holds no
 * client data and is not linked to a request. One per person; "Start again"
 * replaces it.
 */
const SHEET = "Sheet1";
const ROWS: [string, string, number, number][] = [
  ["1000", "Property, plant and equipment, cost", 48_000_000, 0],
  ["1010", "Accumulated depreciation", 0, 14_200_000],
  ["1100", "Inventory (fuel and spares)", 7_380_000, 0],
  ["1200", "Trade receivables", 26_070_000, 0],
  ["1300", "Cash at bank, GTBank", 12_590_000, 0],
  ["2000", "Trade payables", 0, 12_480_000],
  ["2100", "VAT payable", 0, 1_390_000],
  ["2110", "WHT payable", 0, 420_000],
  ["2200", "Bank loan, Access Bank", 0, 15_000_000],
  ["3000", "Share capital", 0, 10_000_000],
  ["3100", "Retained earnings, 1 Jan 2025", 0, 7_500_000],
  ["4000", "Revenue, haulage services", 0, 185_400_000],
  ["5000", "Cost of sales, fuel and drivers", 112_300_000, 0],
  ["6000", "Salaries and wages, admin", 22_100_000, 0],
  ["6100", "Office rent", 6_000_000, 0],
  ["6200", "Vehicle running costs", 5_200_000, 0],
  ["6300", "Depreciation", 3_100_000, 0],
  ["6400", "Other admin expenses", 2_200_000, 0],
  ["7000", "Interest on bank loan", 1_450_000, 0],
];

function sampleEdits(): WbUserEdit[] {
  const money = "#,##0";
  const head = { b: true, bg: "#EEF1FB" };
  const edits: WbUserEdit[] = [
    { sheet: SHEET, cell: "A1", value: "Account code", style: head },
    { sheet: SHEET, cell: "B1", value: "Account name", style: head },
    { sheet: SHEET, cell: "C1", value: "Debit (NGN)", style: head },
    { sheet: SHEET, cell: "D1", value: "Credit (NGN)", style: head },
  ];
  ROWS.forEach(([code, name, dr, cr], i) => {
    const r = i + 2;
    edits.push(
      { sheet: SHEET, cell: `A${r}`, value: code },
      { sheet: SHEET, cell: `B${r}`, value: name },
      { sheet: SHEET, cell: `C${r}`, value: dr, number_format: money },
      { sheet: SHEET, cell: `D${r}`, value: cr, number_format: money },
    );
  });
  const t = ROWS.length + 2;
  edits.push(
    { sheet: SHEET, cell: `B${t}`, value: "Totals", style: { b: true } },
    { sheet: SHEET, cell: `C${t}`, formula: `=SUM(C2:C${t - 1})`, number_format: money, style: { b: true, bt: true } },
    { sheet: SHEET, cell: `D${t}`, formula: `=SUM(D2:D${t - 1})`, number_format: money, style: { b: true, bt: true } },
  );
  return edits;
}

async function who() {
  const u = await getSessionUser();
  if (!u || u.banned) return null;
  const role = roleOf(u);
  if (role !== "admin" && role !== "staff") return null;
  return { u, base: role === "admin" ? "/admin" : "/work" };
}

/** Open this person's practice workbook, or make one. */
export async function openPracticeAction(fresh = false): Promise<Res> {
  const me = await who();
  if (!me) return { ok: false, error: "Practice workbooks are for the firm's team." };
  if (!fresh) {
    const [row] = await db
      .select({ id: workbenchConversation.id })
      .from(workbenchConversation)
      .where(and(eq(workbenchConversation.createdBy, me.u.id), eq(workbenchConversation.practice, true)))
      .orderBy(desc(workbenchConversation.updatedAt))
      .limit(1);
    if (row && (await wbGet(row.id).then(() => true, () => false))) {
      return { ok: true, id: row.id, href: `${me.base}/analyses/w/${row.id}` };
    }
  }
  try {
    const title = "Practice · Kanem Logistics trial balance";
    const res = await wbStart({
      client_id: null,
      document_ids: [],
      ai_mode: "cloud_masked",
      client_name: "Kanem Logistics (sample)",
      title,
      blank_workbook: "Kanem trial balance FY2025",
    });
    const conv = res.conversation;
    const book = conv.workbooks[0];
    if (book) await wbUserEdits(conv.id, book.id, "Practice set-up", sampleEdits());
    // One practice workbook per person: the old one leaves the list.
    await db
      .delete(workbenchConversation)
      .where(and(eq(workbenchConversation.createdBy, me.u.id), eq(workbenchConversation.practice, true)));
    await db.insert(workbenchConversation).values({ id: conv.id, requestId: null, clientId: null, title, createdBy: me.u.id, practice: true });
    await recordAudit({ action: "workbench.practice", entity: "workbench", entityId: conv.id, meta: { fresh } });
    return { ok: true, id: conv.id, href: `${me.base}/analyses/w/${conv.id}` };
  } catch {
    return { ok: false, error: "The practice workbook could not open. The analysis server may be offline. Try again in a minute." };
  }
}

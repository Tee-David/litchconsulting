/** Client-safe invitation labels (the server logic lives in invitations.ts). */
export type ColleagueAccess = "billing" | "reviewer" | "viewer";
export const COLLEAGUE_ACCESS: Record<ColleagueAccess, { label: string; hint: string }> = {
  billing: { label: "Billing contact", hint: "Gets invoices and receipts, and can pay." },
  reviewer: { label: "Reviewer", hint: "Can approve drafts and answer asks." },
  viewer: { label: "Can view", hint: "Sees requests, files and invoices." },
};

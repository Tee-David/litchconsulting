import type { Step } from "./ui";

/**
 * Plain-words stepper for a request, including quote_sent and client_review.
 * `audience` decides whose move a waiting step shows as ("wait" amber for the
 * client's own move; firm viewers see "current").
 */

type Key = "quote" | "payment" | "documents" | "work" | "review" | "delivered";
const ORDER: Key[] = ["quote", "payment", "documents", "work", "review", "delivered"];

const AT: Record<string, { key: Key; clientMove: boolean }> = {
  quote_requested: { key: "quote", clientMove: false },
  quote_sent: { key: "quote", clientMove: true },
  pending_payment: { key: "payment", clientMove: true },
  awaiting_documents: { key: "documents", clientMove: true },
  in_progress: { key: "work", clientMove: false },
  in_review: { key: "work", clientMove: false },
  client_review: { key: "review", clientMove: true },
  delivered: { key: "delivered", clientMove: true },
};

export function requestSteps(
  r: { status: string; pricingMode?: string | null; reviewRound?: number | null; depositPercent?: number | null },
  audience: "client" | "firm" = "client",
): Step[] {
  const keys = ORDER.filter((k) => k !== "quote" || r.pricingMode === "quote" || r.status === "quote_requested" || r.status === "quote_sent");
  const at = AT[r.status];
  const done = r.status === "completed";
  const idx = at ? keys.indexOf(at.key) : -1;
  const round = r.reviewRound ?? 0;
  const label: Record<Key, string> = {
    quote: "Quote",
    payment: r.depositPercent ? "Deposit" : "Payment",
    documents: "Documents",
    work: audience === "client" ? "Our work" : "Work",
    review: audience === "client" ? "Your review" : "Client review",
    delivered: "Delivered",
  };
  const subNow: Partial<Record<string, string>> = {
    quote_requested: audience === "client" ? "We are pricing it" : "Price and send",
    quote_sent: audience === "client" ? "Ready for you" : "With the client",
    pending_payment: audience === "client" ? "Due now" : "Waiting on client",
    awaiting_documents: audience === "client" ? "Upload your files" : "Waiting on client",
    in_progress: round > 0 ? `Draft ${round + 1}` : "Under way",
    in_review: "Checking it",
    client_review: `Round ${round}`,
    delivered: audience === "client" ? "Download and confirm" : "Waiting on client",
  };
  return keys.map((k, i) => {
    let state: Step["state"];
    if (done) state = "done";
    else if (idx < 0) state = "upcoming";
    else if (i < idx) state = "done";
    else if (i === idx) state = at!.clientMove && audience === "client" ? "wait" : "current";
    else state = "upcoming";
    return { label: label[k], sub: i === idx && !done ? subNow[r.status] : undefined, state };
  });
}

/** One sentence: Now … Next … */
export function nowNext(status: string, audience: "client" | "firm" = "client"): { now: string; next: string } {
  const c = audience === "client";
  switch (status) {
    case "quote_requested":
      return { now: c ? "we are preparing your quote" : "price the work and send the quote", next: c ? "you accept it in one click" : "the client accepts" };
    case "quote_sent":
      return { now: c ? "your quote is ready to accept" : "the client is reading the quote", next: "invoice and pay link" };
    case "pending_payment":
      return { now: c ? "payment is due" : "waiting for payment", next: c ? "you upload your documents" : "documents come in" };
    case "awaiting_documents":
      return { now: c ? "we need your documents" : "waiting for documents", next: c ? "we start the work" : "start the work" };
    case "in_progress":
    case "in_review":
      return { now: c ? "we are working on it" : "the work is with us", next: c ? "you review a draft" : "send a draft for review" };
    case "client_review":
      return { now: c ? "your review of the draft" : "the client is reviewing the draft", next: c ? "we send the final files" : "final files" };
    case "delivered":
      return { now: c ? "your final files are ready" : "delivered", next: c ? "confirm to close the request" : "the client confirms" };
    case "completed":
      return { now: "done", next: c ? "request it again whenever you need" : "nothing" };
    default:
      return { now: "closed", next: "nothing" };
  }
}

import { statusLabel } from "@/components/kit/status-chip";

type EventLike = { type: string; toStatus?: string | null; actorRole?: string | null };

/**
 * The words for a request timeline event. One place, so the timeline and the
 * notification lists never show a raw type such as "status".
 * `audience` picks the wording for notes and messages.
 */
export function requestEventTitle(ev: EventLike, audience: "client" | "firm" = "client"): string {
  switch (ev.type) {
    case "created":
      return "Request submitted";
    case "quote_sent":
      return "Quote sent";
    case "payment_received":
      return "Payment received";
    // "status" is an older name for the same event.
    case "status_changed":
    case "status":
      return ev.toStatus ? `Status changed to ${statusLabel("request", ev.toStatus).toLowerCase()}` : "Status changed";
    case "document_uploaded":
      return "Document uploaded";
    case "documents_complete":
      return "All documents received";
    case "deliverable_uploaded":
      return "Deliverable ready";
    case "note":
      if (audience === "firm") return "Note";
      return ev.actorRole === "admin" ? "Note from your advisor" : "Note";
    case "message":
      if (ev.actorRole === "admin") return audience === "firm" ? "Message from the firm" : "Message from your advisor";
      if (ev.actorRole === "client") return audience === "firm" ? "Message from the client" : "Your message";
      return "Message";
    case "processing_update":
      switch (ev.toStatus) {
        case "under_review":
          return "Documents under review";
        case "processed":
          return "Documents processed";
        case "needs_attention":
          return "Needs your attention";
        default:
          return "Update on your request";
      }
    case "correction_requested":
      return "Correction requested";
    case "ai_analysis_started":
      return "AI analysis started";
    case "ai_analysis_completed":
      return "AI analysis completed";
    case "ai_working_copy_saved":
      return "Working copy saved";
    case "invoice_linked":
      return "Invoice linked";
    case "cancelled":
      return "Request cancelled";
    case "declined":
      return "Quote declined";
    case "refunded":
      return "Payment refunded";
    default: {
      // Never show a raw type: "some_event" reads "Some event".
      const t = ev.type.replace(/_/g, " ").trim();
      return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Update";
    }
  }
}

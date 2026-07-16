/**
 * Client Help & Support content — the source of truth for the FAQ / knowledge
 * base shown on /dashboard/support. Plain, human answers written for Litch
 * Consulting portal clients (Nigerian finance consultancy). Pure data, no React
 * — the support hub imports this directly and filters it client-side.
 */

export type HelpCategoryKey =
  | "getting-started"
  | "billing"
  | "services"
  | "documents"
  | "account";

/**
 * Icon *name* rather than a component — this file stays pure data, and the
 * support hub maps these onto lucide icons at render time.
 */
export type HelpCategoryIcon = "rocket" | "receipt" | "briefcase" | "folder" | "shield";

export type HelpCategory = {
  key: HelpCategoryKey;
  label: string;
  description: string;
  icon: HelpCategoryIcon;
};

export type HelpArticle = {
  slug: string;
  category: HelpCategoryKey;
  question: string;
  /** Plain text; blank lines separate paragraphs (rendered with pre-line). */
  answer: string;
  /** Extra search terms beyond the question/answer text. */
  keywords: string[];
};

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    key: "getting-started",
    label: "Getting Started",
    description: "New to the portal? Set up your account and find your way around.",
    icon: "rocket",
  },
  {
    key: "billing",
    label: "Billing & Payments",
    description: "Invoices, paying securely with Paystack, receipts and refunds.",
    icon: "receipt",
  },
  {
    key: "services",
    label: "Services & Requests",
    description: "Request a service, get a quote and track engagement progress.",
    icon: "briefcase",
  },
  {
    key: "documents",
    label: "Documents & Deliverables",
    description: "Upload source files and download your finished reports safely.",
    icon: "folder",
  },
  {
    key: "account",
    label: "Account & Security",
    description: "Your profile, data privacy under the NDPA and reaching support.",
    icon: "shield",
  },
];

export function categoryMeta(key: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.key === key);
}

/** Every article filed under a category, in authoring order. */
export function articlesInCategory(
  key: HelpCategoryKey,
  articles: HelpArticle[] = HELP_ARTICLES,
): HelpArticle[] {
  return articles.filter((a) => a.category === key);
}

/** How many articles each category holds — for the category card counts. */
export function categoryCounts(articles: HelpArticle[] = HELP_ARTICLES): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of articles) counts[a.category] = (counts[a.category] ?? 0) + 1;
  return counts;
}

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Getting Started ───────────────────────────────────────────────
  {
    slug: "getting-started-overview",
    category: "getting-started",
    question: "How do I get started with Litch Consulting?",
    answer:
      "Welcome aboard. Your Client Portal is the single place to request services, review quotes, pay invoices, share documents and download the deliverables we prepare for you.\n\nA good first step is to open your Dashboard to see any active engagements at a glance, then head to Request a Service to tell us what you need. If you would rather talk it through first, you can book a consultation and one of our advisors will reach out.",
    keywords: ["start", "onboard", "welcome", "portal", "begin", "new client"],
  },
  {
    slug: "book-a-consultation",
    category: "getting-started",
    question: "How do I book a consultation?",
    answer:
      "You can book a free introductory consultation from the marketing site's Contact / Book a call section, or by starting a service request and choosing the option to speak with an advisor first.\n\nPick a slot that suits you and we will confirm by email. Consultations are held over a video or phone call; there is no charge for the initial conversation where we scope your needs.",
    keywords: ["call", "meeting", "advisor", "appointment", "consult", "schedule", "cal.com"],
  },
  {
    slug: "services-offered",
    category: "getting-started",
    question: "What services does Litch Consulting offer?",
    answer:
      "We are a professional finance firm covering financial reporting, financial modelling, taxation and compliance, forensic accounting, data analytics and advisory.\n\nEach of these can be requested from the Request a Service page. If you are unsure which service fits your situation, start a request and describe your goal in your own words — we will recommend the right engagement in the quote.",
    keywords: ["reporting", "modelling", "tax", "forensic", "analytics", "advisory", "audit"],
  },

  // ── Services & Requests ───────────────────────────────────────────
  {
    slug: "request-a-service",
    category: "services",
    question: "How do I request a service?",
    answer:
      "Go to Request a Service from your dashboard, choose the service you need and answer a few short questions about your business and what you are trying to achieve. Attach any starting documents if you have them — you can always add more later.\n\nOnce you submit, our team reviews the request and sends you a quote. You will see the new request appear under My Requests where you can follow its status from quote through to delivery.",
    keywords: ["new request", "order", "engage", "hire", "start service", "quote request"],
  },
  {
    slug: "turnaround-times",
    category: "services",
    question: "How long will my engagement take?",
    answer:
      "Turnaround depends on the service and the completeness of the documents you provide. As a rough guide: tax filings and compliance reviews typically take 3–5 business days once we have everything; management accounts and reporting around 5–7 business days; financial models and forensic or advisory engagements are scoped individually and the timeline is stated in your quote.\n\nThe biggest factor is how quickly complete, legible documents are uploaded. Every request shows a live status and tracking history so you always know what stage you are at.",
    keywords: ["how long", "timeline", "duration", "delivery time", "sla", "deadline", "wait"],
  },
  {
    slug: "track-request-progress",
    category: "services",
    question: "How do I track the progress of my request?",
    answer:
      "Open My Requests and select the request you want to follow. Each request has a tracking history — a step-by-step timeline showing when it was submitted, when the quote was sent, when payment was received, when documents were uploaded and when the deliverable is ready.\n\nWe also email you at key milestones. If anything is blocking progress (for example a missing document), it will be flagged on the request so you know exactly what we need from you.",
    keywords: ["status", "progress", "timeline", "tracking", "where is my", "stage", "update"],
  },

  // ── Billing & Payments ────────────────────────────────────────────
  {
    slug: "how-payment-works",
    category: "billing",
    question: "How does payment work and how do I pay an invoice?",
    answer:
      "When we send you an invoice, you receive an email with a secure link, and the invoice also appears under Invoices in your portal. Open it and choose Pay Now to be taken to our Paystack checkout.\n\nPayments are processed securely by Paystack — we never see or store your card details. Once your payment succeeds, the invoice is marked Paid automatically, a receipt is generated for you to download, and the linked engagement moves forward. Bank transfer details are also shown on the invoice if you prefer to pay that way.",
    keywords: ["pay", "paystack", "checkout", "invoice", "payment", "card", "transfer", "settle"],
  },
  {
    slug: "payment-methods",
    category: "billing",
    question: "What payment methods can I use?",
    answer:
      "Through Paystack you can pay by debit or credit card, bank transfer, USSD and supported bank apps in Naira. If you would rather pay by direct bank transfer, the firm's bank name, account name and account number are printed on every invoice.\n\nAfter a transfer, keep your payment reference — if the invoice does not update automatically within a short while, send us the reference through Contact Support and we will reconcile it.",
    keywords: ["card", "bank transfer", "ussd", "naira", "methods", "options", "how to pay"],
  },
  {
    slug: "read-invoice-status",
    category: "billing",
    question: "How do I read my invoice status?",
    answer:
      "Every invoice carries a status so you always know where it stands:\n\n• Draft — being prepared; no action needed yet.\n• Sent — awaiting your payment.\n• Paid — payment received and confirmed; a receipt is available to download.\n• Overdue — the due date has passed; please settle it or contact us.\n• Void — cancelled and no longer payable.\n\nYou can filter your invoice list by status, and open any invoice to see the full breakdown and download a PDF.",
    keywords: ["invoice status", "paid", "sent", "overdue", "draft", "void", "meaning", "unpaid"],
  },
  {
    slug: "refunds-policy",
    category: "billing",
    question: "What is your refund policy?",
    answer:
      "If work has not yet started on a paid engagement, you can request a full refund. Once work is underway, refunds are considered on a pro-rata basis for the portion not yet delivered, at our discretion and in line with the terms in your engagement letter.\n\nTo request a refund, open the relevant request or invoice and use Contact Support with the invoice number. Approved refunds are returned to your original Paystack payment method, which can take a few business days to reflect depending on your bank.",
    keywords: ["refund", "money back", "cancel payment", "reimburse", "chargeback", "dispute"],
  },

  // ── Documents & Deliverables ──────────────────────────────────────
  {
    slug: "upload-documents",
    category: "documents",
    question: "Where do I upload my documents?",
    answer:
      "Documents are uploaded against the specific request they belong to. Open the request from My Requests and use the Documents / Upload area to add your files — bank statements, trial balances, prior accounts, receipts or whatever the engagement needs.\n\nYou can upload during a request and keep adding more afterwards. Clear, complete documents are the single biggest thing that speeds up your turnaround, so upload everything you have as early as you can.",
    keywords: ["upload", "documents", "files", "attach", "statements", "share", "send files"],
  },
  {
    slug: "download-deliverables",
    category: "documents",
    question: "How do I download my deliverables?",
    answer:
      "When your report, model or filing is ready, the deliverable is attached to your request and you receive an email letting you know. Open the request and use the Download button next to the deliverable to save it.\n\nDeliverables remain available in your portal for the life of the engagement, so you can return and download them again whenever you need a copy.",
    keywords: ["download", "deliverable", "report", "result", "output", "final", "get my report"],
  },
  {
    slug: "accepted-file-formats",
    category: "documents",
    question: "What file formats and sizes can I upload?",
    answer:
      "We accept the common business formats: PDF, Excel (.xlsx/.xls), CSV, Word documents and images (JPG/PNG) of scanned records. For accounting data, an Excel or CSV export is far easier to work with than a photo, so please export from your system where possible.\n\nUpload legible, complete files — if a scan is blurry or a page is missing we may have to pause and ask for a replacement, which slows delivery. If a single file is very large, split it or contact us and we will arrange a secure alternative.",
    keywords: ["format", "pdf", "excel", "csv", "image", "size", "file type", "scan"],
  },

  // ── Account & Security ────────────────────────────────────────────
  {
    slug: "data-privacy-ndpa",
    category: "account",
    question: "How is my data protected?",
    answer:
      "We treat your financial information as strictly confidential and handle personal data in line with the Nigeria Data Protection Act (NDPA) 2023. Your documents are stored securely, access is limited to the team working on your engagement, and files are transmitted over encrypted connections.\n\nWe use your data only to deliver the services you have requested. You may ask us what personal data we hold, request corrections, or request erasure of your data when it is no longer needed for an active engagement or a legal obligation — just reach out through Contact Support.",
    keywords: ["privacy", "ndpa", "data protection", "confidential", "security", "gdpr", "erasure", "delete data"],
  },
  {
    slug: "contact-support",
    category: "account",
    question: "How do I contact support?",
    answer:
      "The fastest way is the Contact Support button on this page — it opens a ticket that goes straight to our team, and you can reply to the thread right here in the portal. Include the relevant request or invoice number so we can help without back-and-forth.\n\nYou will get email notifications when we reply, and every ticket keeps its full conversation history so nothing gets lost. For account-critical or urgent matters, mark the ticket accordingly when you raise it.",
    keywords: ["contact", "support", "ticket", "help", "email", "reach", "talk to someone", "raise issue"],
  },
  {
    slug: "update-account-details",
    category: "account",
    question: "How do I update my profile or password?",
    answer:
      "You can update your name, contact details and notification preferences from your account settings, reachable from the menu under your profile. If you signed up with an email and password, you can change your password there; if you signed in with Google, manage that through your Google account.\n\nIf you are locked out or your email address has changed and you cannot sign in, raise a ticket through Contact Support and we will verify your identity and help you regain access.",
    keywords: ["password", "profile", "account", "email", "login", "settings", "change details", "reset"],
  },
];

/** Case-insensitive match across question, answer and keywords. */
export function searchArticles(query: string, articles: HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const terms = needle.split(/\s+/).filter(Boolean);
  return articles.filter((a) => {
    const haystack = `${a.question} ${a.answer} ${a.keywords.join(" ")}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

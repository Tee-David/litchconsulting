import { centerStep, type TourDef, type TourStep } from "./tour-types";

/**
 * Tours v3 (15 Nov 2026): page tours and the full walkthroughs for admin, staff
 * and client. Copy follows ASD-STE100: what the part is, then why it helps.
 * Optional stops drop out when their part is not on the page (an empty list).
 */
type S = Partial<TourStep>;
const t = (key: string, target: string, title: string, content: string, extra: S = {}): TourStep => ({
  key,
  target: `[data-tour="${target}"]`,
  title,
  content,
  ...extra,
});
const page = (id: string, audience: TourDef["audience"], route: string, steps: TourStep[], version = 3): TourDef => ({
  id,
  audience,
  kind: "page",
  version,
  route,
  steps,
});

// ─── shared pieces ──────────────────────────────────────────────────────────────
const sageSteps = (role: "admin" | "staff"): TourStep[] => [
  t("starters", "sage-starters", "Start with a question", role === "admin" ? "Pick a starter, or type your own. Sage reads your books and the firm knowledge base." : "Pick a starter, or type your own. Sage reads your assigned requests and the knowledge base.", { icon: "sparkles", optional: true }),
  t("lessons", "learn-sage-link", "New to Sage?", "Eight short lessons. You ask real questions with safe examples, and nothing in the books changes.", { icon: "lightbulb", optional: true }),
  ...(role === "admin" ? [t("scope", "sage-scope", "Whole firm or one client", "Set the scope to One client to make Sage read only that client's records.", { icon: "filter", optional: true })] : []),
  t("composer", "sage-composer", "Ask here", "Enter sends. Shift+Enter starts a new line. Tap the mic to speak instead.", { icon: "send", placement: "top" }),
  t("history", "sage-history", "Your chats", "Every chat is kept. Search old chats, or start a new chat for a new subject.", { icon: "clock", desktopOnly: true, placement: "right" }),
  t("history-phone", "sage-history-button", "Your chats", "Open this to search old chats or start a new one.", { icon: "clock", mobileOnly: true }),
];

const workbenchSteps: TourStep[] = [
  t("grid", "wb-grid", "The sheet", "It works like Excel. Click a cell to read it, type to change it, right-click for rows, columns and \"Ask Sage about this range\".", { icon: "layout" }),
  t("toolbar", "wb-undo", "The toolbar", "Undo and redo, number formats, bold, colours, borders and merge. A pressed button shows the format of the selected cell.", { icon: "settings", optional: true }),
  t("namebox", "wb-namebox", "Name box", "It shows the selected cell. Type a cell or a range, for example D14, and press Enter to go there.", { icon: "search", optional: true }),
  t("sage-tab", "wb-sage-tab", "Sheet or Sage", "On a phone, switch between the sheet and Sage here. Both keep their place.", { icon: "panelLeft", mobileOnly: true }),
  t("overview", "wb-overview", "Job overview", "When files are added, Sage says what each file is, runs the first checks and asks what to do next. Pick a button, or type your own request.", { icon: "fileStack", optional: true, placement: "left" }),
  t("sage", "wb-sage", "Sage for this workbook", "Ask about the sheet. Sage reads your selection, shows its steps, and proposes changes. Nothing changes until you accept.", { icon: "sparkles", placement: "left" }),
  t("rules", "wb-instructions", "Instructions", "Rules Sage follows in every answer in this workbook, for example \"Show amounts in naira thousands\".", { icon: "penSquare", optional: true }),
  t("proposals", "wb-proposal", "Proposed changes", "Sage's changes wait here. Accept keeps them as a new version. Reject drops them.", { icon: "badgeCheck", optional: true, placement: "top" }),
];

const launcherStep = (role: string): TourStep =>
  t("launcher", "tour-launcher", "Tours, any time", `Open this for a tour of the page you are on, this walkthrough again${role === "client" ? "" : ", or the Learn Sage lessons"}.`, { icon: "compass" });

// ─── admin ──────────────────────────────────────────────────────────────────────
const ADMIN_PAGES: TourDef[] = [
  page("admin-dashboard", "admin", "/admin", [
    t("deck", "needs-action", "What needs you", "One card at a time, the most urgent first. The main button does the next step. Snooze hides a card until tomorrow; Hand over gives it to a colleague.", { icon: "flag" }),
    t("onboarding", "onboarding", "Finish setting up", "Firm details, bank details and the team. Each item opens the page where you do it.", { icon: "check", optional: true }),
    t("kpis", "kpi-stats", "The figures", "Money in, money owed, open work and late work. Click a figure to open the list behind it.", { icon: "gauge" }),
    t("billed", "billed-collected", "Billed and collected", "What you invoiced against what came in, month by month. A gap means money to chase.", { icon: "barChart", optional: true }),
    t("pipeline", "pipeline", "Where the work is", "Requests by stage. A long bar shows where work waits.", { icon: "activity", optional: true }),
  ]),
  page("admin-requests", "admin", "/admin/requests", [
    t("table", "requests-table", "All requests", "Use the tabs to filter by status, and search by client or number. Open a request to see its steps, asks, drafts and team.", { icon: "inbox" }),
    centerStep("consult", "Consultations and services", "The buttons at the top open booked consultations and the services clients can request.", { icon: "briefcase" }),
  ]),
  page("admin-request", "admin", "/admin/requests/[id]", [
    t("move", "req-move", "Whose move", "This card says who must act next, and the button does it.", { icon: "flag", optional: true }),
    t("progress", "req-progress", "Progress", "The stages of the work. The client sees the same stages.", { icon: "activity", optional: true }),
    t("asks", "req-asks", "Asks", "Documents and answers you need from the client. The client gets a reminder until each ask is done.", { icon: "fileText", optional: true }),
    t("workbench", "req-workbench", "Work on the files", "Open the request's files in the workbench, with Sage beside the sheet.", { icon: "fileStack", optional: true }),
    t("assign", "req-assign", "The team", "Assign staff here. Staff see only the requests assigned to them, and never the money.", { icon: "users", optional: true }),
  ]),
  page("admin-clients", "admin", "/admin/clients", [
    t("table", "clients-table", "Clients", "Every client with their work and money. Open one for notes, files, invoices and the AI setting (cloud with names masked, or local only).", { icon: "users" }),
    t("new", "new-client", "Add a client", "Add a client by hand, or let them sign up and request a service.", { icon: "plus", optional: true }),
  ]),
  page("admin-analyses", "admin", "/admin/analyses", [
    t("new", "analyses-new", "New analysis", "Open a workbench on a request's files, a blank workbook, or files you upload: spreadsheets, PDF, pictures, or ZIP, RAR and 7z archives up to 20 MB.", { icon: "plus", optional: true }),
    t("recent", "analyses-recent", "Recent workbenches", "Go back to a workbench where you stopped. Every version is kept.", { icon: "clock", optional: true }),
    t("studio", "analyses-studio", "Files Sage has read", "Documents the pipeline has read, with their status.", { icon: "fileStack", optional: true }),
  ]),
  page("admin-workbench", "admin", "/admin/analyses/w/[id]", workbenchSteps, 4),
  page("admin-billing", "admin", "/admin/billing", [
    t("tabs", "finance-tabs", "Billing", "Quotes and invoices, payments to confirm, expenses, and the tools. The same tabs are on every billing page.", { icon: "wallet" }),
    t("stats", "invoice-stats", "The money", "Billed, paid and owed. Late amounts show first.", { icon: "gauge", optional: true }),
    t("table", "invoices-table", "Quotes and invoices", "Open one to edit, send, record a payment or download the PDF. The client pays on a private link.", { icon: "receipt", optional: true }),
  ]),
  page("admin-help-desk", "admin", "/admin/help-desk", [
    t("view", "helpdesk-view", "Help desk", "Tickets on the left, the thread in the middle, the details on the right. Reply, add tags, and set the status.", { icon: "lifeBuoy" }),
  ]),
  page("admin-sage", "admin", "/admin/sage", sageSteps("admin")),
  page("admin-reports", "admin", "/admin/reports", [
    t("tabs", "reports-tabs", "Reports", "Pick a report: revenue, clients, services, aging and more.", { icon: "barChart", optional: true }),
    t("stats", "reports-stats", "The totals", "The totals for the period you chose. Export to CSV from each report.", { icon: "gauge", optional: true }),
  ]),
  page("admin-audit", "admin", "/admin/audit", [
    centerStep("intro", "Audit log", "Every important action: who did it, when, and to what. Sage's confirmed plans are here too. Export it for your records.", { icon: "shieldCheck" }),
  ]),
  page("admin-trash", "admin", "/admin/trash", [
    centerStep("intro", "Trash", "Deleted clients, invoices, tickets and requests stay here for 30 days. Restore one, or delete it for ever (you type to confirm).", { icon: "trash" }),
  ]),
  page("admin-settings", "admin", "/admin/settings", [
    t("tabs", "settings-tabs", "Settings", "Firm details, team and access, notifications, billing and tax, backups, integrations, privacy and security.", { icon: "settings" }),
  ]),
  page("admin-integrations", "admin", "/admin/settings/integrations", [
    t("grid", "integrations-grid", "Integrations", "Email, payments, storage and the AI engine. A red dot means the service needs attention.", { icon: "cable", optional: true }),
  ]),
];

const ADMIN_WALK: TourStep[] = [
  centerStep("welcome", "Welcome to Litch", "This walkthrough shows each part of the platform in order. Use Next and Back. Stop at any time: the ? menu lets you resume.", { route: "/admin", page: "Home", icon: "compass", showEstimate: true }),
  t("mobile-menu", "mobile-menu", "The menu", "On a phone, every page is in this menu.", { route: "/admin", icon: "panelLeft", mobileOnly: true }),
  t("deck", "needs-action", "What needs you", "Start each day here. One card at a time, the most urgent first. Do it, snooze it or hand it over.", { route: "/admin", icon: "flag" }),
  t("kpis", "kpi-stats", "The figures", "Money in, money owed, open work and late work.", { route: "/admin", icon: "gauge" }),
  t("requests", "requests-table", "Requests", "All client work. Filter by status and open a request to manage it.", { route: "/admin/requests", page: "Requests", icon: "inbox" }),
  t("clients", "clients-table", "Clients", "Each client with notes, files, invoices and their AI setting.", { route: "/admin/clients", page: "Clients", icon: "users" }),
  t("analyses", "analyses-new", "Analyses", "The workbench: a spreadsheet with Sage beside it. Upload files or archives, and Sage reads them first.", { route: "/admin/analyses", page: "Analyses", icon: "fileStack", optional: true }),
  t("recent", "analyses-recent", "Back where you stopped", "Recent workbenches. Learn Sage has a practice workbook with sample figures.", { route: "/admin/analyses", icon: "clock", optional: true }),
  t("billing", "finance-tabs", "Billing", "Quotes, invoices, payments to confirm and expenses.", { route: "/admin/billing", page: "Billing", icon: "wallet" }),
  t("help", "helpdesk-view", "Help desk", "Client tickets with replies, tags and status.", { route: "/admin/help-desk", page: "Help desk", icon: "lifeBuoy" }),
  t("sage", "sage-composer", "Sage", "Ask about clients, money, requests or Nigerian tax. Changes come back as a plan you confirm.", { route: "/admin/sage", page: "Sage", icon: "sparkles", placement: "top" }),
  t("lessons", "learn-sage-link", "Learn Sage", "Short lessons that make you use Sage, step by step.", { route: "/admin/sage", icon: "lightbulb", optional: true }),
  t("reports", "reports-tabs", "Reports", "Revenue, clients, services and aging, with CSV export.", { route: "/admin/reports", page: "Reports", icon: "barChart", optional: true }),
  centerStep("audit", "Audit log", "Who did what, and when. Every confirmed Sage plan is here too.", { route: "/admin/audit", page: "Audit log", icon: "shieldCheck" }),
  centerStep("trash", "Trash", "Deleted items stay for 30 days. Restore them here.", { route: "/admin/trash", page: "Trash", icon: "trash" }),
  t("settings", "settings-tabs", "Settings", "Firm details, team, billing and tax, backups, integrations and privacy.", { route: "/admin/settings", page: "Settings", icon: "settings" }),
  t("team", "access-team", "Team and access", "Invite staff and admins. Admins and staff must use two-step sign-in.", { route: "/admin/settings/access", page: "Team and access", icon: "users", optional: true }),
  t("integrations", "integrations-grid", "Integrations", "Email, payments, storage and the AI engine, with their health.", { route: "/admin/settings/integrations", page: "Integrations", icon: "cable", optional: true }),
  t("launcher", "tour-launcher", "Tours, any time", "Open this for a tour of the page you are on, this walkthrough again, or the Learn Sage lessons.", { route: "/admin", page: "Home", icon: "compass" }),
  centerStep("end", "You are ready", "That is the platform. Start with What needs you each morning, and ask Sage when you need a figure or a rule.", { icon: "check" }),
];

// ─── staff ──────────────────────────────────────────────────────────────────────
const STAFF_PAGES: TourDef[] = [
  page("staff-home", "staff", "/work", [
    t("attention", "attention", "What needs you", "Your assigned work that waits on you, the most urgent first.", { icon: "flag" }),
    t("requests", "work-requests", "My requests", "Only the requests an admin assigned to you.", { icon: "inbox", optional: true }),
    t("week", "work-week", "This week", "Due dates for your work in the next days.", { icon: "clock", optional: true }),
    t("sage", "work-sage", "Ask Sage", "Ask about your requests or Nigerian tax. Sage shows no amounts to staff.", { icon: "sparkles", optional: true }),
  ]),
  page("staff-requests", "staff", "/work/requests", [
    t("table", "staff-requests-table", "My requests", "Open a request for the client brief, files, asks, drafts and messages.", { icon: "inbox" }),
  ]),
  page("staff-analyses", "staff", "/work/analyses", [
    centerStep("intro", "Files and workbenches", "The files of your requests and their workbenches. Open one to work on the sheet with Sage.", { icon: "fileStack" }),
  ]),
  page("staff-conversations", "staff", "/work/conversations", [
    t("threads", "threads-list", "Conversations", "One thread per request. Messages reach the client by email too.", { icon: "send" }),
  ]),
  page("staff-sage", "staff", "/work/sage", sageSteps("staff")),
  page("staff-workbench", "staff", "/work/analyses/w/[id]", workbenchSteps, 4),
  page("staff-notifications", "staff", "/work/notifications", [
    t("list", "notif-list", "Notifications", "Everything that happened on your work, newest first.", { icon: "bell", optional: true }),
    t("prefs", "notif-prefs", "How you hear", "Choose email, push or only here, for each kind of event.", { icon: "settings", optional: true }),
  ]),
];

const STAFF_WALK: TourStep[] = [
  centerStep("welcome", "Your workspace", "You see only the work an admin assigned to you, and never the money. This walkthrough shows each part. Stop at any time and resume from the ? menu.", { route: "/work", page: "My work", icon: "compass", showEstimate: true }),
  t("attention", "attention", "What needs you", "Start here each day. The most urgent work first.", { route: "/work", icon: "flag" }),
  t("requests", "staff-requests-table", "My requests", "Open a request for its brief, files, asks and drafts.", { route: "/work/requests", page: "My requests", icon: "inbox" }),
  centerStep("files", "Files and the workbench", "Open a request's files in the workbench: a spreadsheet with Sage beside it. Sage proposes changes; you accept or reject them.", { route: "/work/analyses", page: "Files", icon: "fileStack" }),
  t("threads", "threads-list", "Conversations", "Client messages, one thread per request.", { route: "/work/conversations", page: "Conversations", icon: "send", optional: true }),
  t("sage", "sage-composer", "Sage", "Ask about your requests or Nigerian tax rules.", { route: "/work/sage", page: "Sage", icon: "sparkles", placement: "top" }),
  t("lessons", "learn-sage-link", "Learn Sage", "Short lessons with a practice workbook. Nothing real changes.", { route: "/work/sage", icon: "lightbulb", optional: true }),
  t("notifications", "notif-list", "Notifications", "Everything that happened on your work.", { route: "/work/notifications", page: "Notifications", icon: "bell", optional: true }),
  launcherStep("staff"),
  centerStep("end", "You are ready", "Check What needs you each morning. Ask Sage when you need a rule or a fact about a request.", { icon: "check" }),
];

// ─── client ─────────────────────────────────────────────────────────────────────
const CLIENT_PAGES: TourDef[] = [
  page("client-dashboard", "client", "/dashboard", [
    t("attention", "attention", "What needs you", "A quote to accept, a payment, a document we asked for, or a draft to review. Everything else is with us.", { icon: "flag", optional: true }),
    t("new", "new-request", "Request a service", "Choose a service and tell us about the work. We send a quote. You pay nothing before you accept it.", { icon: "plus", optional: true }),
    t("files", "recent-files", "Files from us", "Drafts and final documents, ready to download.", { icon: "fileStack", optional: true }),
    t("billing", "billing-summary", "Billing", "What you owe and what you paid.", { icon: "wallet", optional: true }),
    t("onboarding", "onboarding", "Finish setting up", "Your company details go on every quote and invoice.", { icon: "check", optional: true }),
  ]),
  page("client-requests", "client", "/dashboard/requests", [
    t("new", "request-service", "Request a service", "Start a new piece of work here.", { icon: "plus", optional: true }),
    centerStep("list", "Your requests", "Every piece of work, with whose move it is. Open one for its progress, our questions, messages and files.", { icon: "inbox" }),
  ]),
  page("client-request-new", "client", "/dashboard/requests/new", [
    t("picker", "service-picker", "Pick a service", "Fixed-price services can be paid at once. A service marked \"Get a quote\" gets a price from us first.", { icon: "pointer", optional: true }),
  ]),
  page("client-request", "client", "/dashboard/requests/[id]", [
    t("stepper", "request-stepper", "Progress", "The stages of your work. We move it on and tell you by email.", { icon: "activity", optional: true }),
    t("asks", "client-asks", "We asked you for", "Documents or answers we need. Upload a file or reply here.", { icon: "fileText", optional: true }),
  ]),
  page("client-billing", "client", "/dashboard/billing", [
    t("table", "billing-table", "Quotes and invoices", "Accept a quote, pay an invoice by card, or pay by transfer and upload the proof. Receipts come by email.", { icon: "wallet", optional: true }),
  ]),
  page("client-files", "client", "/dashboard/files", [
    t("again", "request-again", "Same again", "Start a follow-on request from finished work. Your files come with it.", { icon: "replay", optional: true }),
    centerStep("files", "Your files", "Everything you sent us and everything we delivered. Download links work only for your account.", { icon: "fileStack" }),
  ]),
  page("client-support", "client", "/dashboard/support", [
    t("kb", "support-kb", "Help articles", "Most questions about payments, documents and dates have an answer here.", { icon: "search", optional: true }),
    t("contact", "support-contact", "Ask us", "Open a ticket. We reply here and by email.", { icon: "send", optional: true }),
    t("tickets", "support-view", "Your tickets", "Every conversation with its status.", { icon: "lifeBuoy", optional: true }),
  ]),
  page("client-notifications", "client", "/dashboard/notifications", [
    t("list", "notif-list", "Notifications", "Everything we told you, newest first.", { icon: "bell", optional: true }),
    t("prefs", "notif-prefs", "How you hear from us", "Choose email, push or only here, for each kind of event.", { icon: "settings", optional: true }),
  ]),
  page("client-settings", "client", "/dashboard/settings", [
    t("form", "settings-form", "Your details", "Your name and company details. They go on every quote and invoice.", { icon: "settings", optional: true }),
    centerStep("more", "Team, two-step and privacy", "Invite colleagues, turn on two-step sign-in, and download or delete your data from this page.", { icon: "shieldCheck" }),
  ]),
];

const CLIENT_WALK: TourStep[] = [
  centerStep("welcome", "Welcome", "This short walk shows how to work with us: request a service, send files, pay, and follow the work. Stop at any time and resume from the ? menu.", { route: "/dashboard", page: "Home", icon: "compass", showEstimate: true }),
  t("attention", "attention", "What needs you", "Anything that waits on you shows here first.", { route: "/dashboard", icon: "flag", optional: true }),
  t("new", "new-request", "Request a service", "Tell us about the work. We send a quote first.", { route: "/dashboard", icon: "plus", optional: true }),
  t("requests", "request-service", "Your requests", "Every piece of work with its progress, our questions and the drafts to review.", { route: "/dashboard/requests", page: "Requests", icon: "inbox", optional: true }),
  t("billing", "billing-table", "Billing", "Accept quotes and pay invoices by card or transfer.", { route: "/dashboard/billing", page: "Billing", icon: "wallet", optional: true }),
  centerStep("files", "Files", "Everything you sent us and everything we delivered, in one place.", { route: "/dashboard/files", page: "Files", icon: "fileStack" }),
  t("support", "support-contact", "Support", "Ask us anything. We reply here and by email.", { route: "/dashboard/support", page: "Support", icon: "lifeBuoy", optional: true }),
  t("settings", "settings-form", "Settings", "Your details, colleagues, two-step sign-in and privacy.", { route: "/dashboard/settings", page: "Settings", icon: "settings", optional: true }),
  launcherStep("client"),
  centerStep("end", "You are ready", "Check What needs you when you sign in. We send an email when something needs you.", { icon: "check" }),
];

const walk = (id: string, audience: TourDef["audience"], steps: TourStep[]): TourDef => ({ id, audience, kind: "walkthrough", version: 3, steps });

export const TOURS_V3: Record<string, TourDef> = Object.fromEntries(
  [
    ...ADMIN_PAGES,
    ...STAFF_PAGES,
    ...CLIENT_PAGES,
    walk("admin-walkthrough", "admin", ADMIN_WALK),
    walk("staff-walkthrough", "staff", STAFF_WALK),
    walk("client-walkthrough", "client", CLIENT_WALK),
  ].map((d) => [d.id, d]),
);

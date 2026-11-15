import { centerStep, type TourDef, type TourStep } from "./tour-types";

/**
 * Learn Sage: short lessons for the firm's team (admin and staff). Each lesson
 * makes the person use Sage with a safe example and ends with "Your turn".
 * Only read questions run; a plan (proposal) is dismissed by the tour, and the
 * workbench lessons work on the practice workbook (sample data).
 *
 * Real AI calls: lesson 1 (a tax question) and lesson 4 (two workbench
 * questions). The others use the free pipeline (records, plans).
 */
type Role = "admin" | "staff";

const ANSWER = '[data-tour="sage-answer-last"]';
const COMPOSER = '[data-tour="sage-composer"]';
const WB = '[data-tour="wb-sage"]';

const sagePage = (role: Role) => (role === "admin" ? "/admin/sage" : "/work/sage");

function done(next: string): TourStep {
  return centerStep("done", "Lesson done", next, { icon: "check" });
}

function lessonAsk(role: Role): TourStep[] {
  return [
    centerStep(
      "intro",
      "Ask Sage anything",
      "Sage answers questions about Nigerian tax, your clients and your work. In this lesson, you ask one question. Then you see where the answer comes from.",
      { route: sagePage(role), page: "Sage", icon: "sparkles", showEstimate: true },
    ),
    {
      key: "ask",
      target: COMPOSER,
      placement: "top",
      title: "Ask a question",
      content: "You type here and press Enter. Shift+Enter starts a new line. Let us ask a question about VAT.",
      icon: "send",
      action: { kind: "ask", label: "Ask Sage", text: "What VAT rate applies to professional services?" },
    },
    {
      key: "answer",
      target: ANSWER,
      placement: "auto",
      title: "The answer",
      content: "Sage gives the answer first, then the details. A rate or a rule always comes with its source.",
      icon: "lightbulb",
    },
    {
      key: "sources",
      target: `${ANSWER} [data-tour="sage-sources"]`,
      title: "See the sources",
      content: "This chip shows how many sources Sage used.",
      icon: "fileStack",
      interact: { hint: "Click the sources chip to open them." },
    },
    {
      key: "sources-sheet",
      target: '[data-tour="sage-sources-sheet"]',
      inDialog: true,
      placement: "auto",
      title: "Each source",
      content: "Each line is a part of the firm knowledge base or a record. Read it to check the answer. Close this panel to go on.",
      icon: "search",
    },
    {
      key: "provenance",
      target: `${ANSWER} [data-tour="sage-provenance"]`,
      title: "How Sage did this",
      content: "This line shows how Sage made the answer: from the records or the knowledge base, and which model wrote the words. Read it when an answer looks wrong.",
      icon: "gauge",
    },
    {
      key: "turn",
      target: COMPOSER,
      placement: "top",
      title: "Your turn",
      content: "Ask your own tax question. Sage answers in a few seconds.",
      icon: "pointer",
      action: {
        kind: "turn",
        examples: ["What is the WHT rate on rent paid to a company?", "When is the monthly VAT return due?", "How is the development levy calculated?"],
      },
    },
    done("You asked Sage, read the answer and checked its sources. Next: ask about the firm's own records."),
  ];
}

function lessonFirm(role: Role): TourStep[] {
  const admin = role === "admin";
  return [
    centerStep(
      "intro",
      admin ? "Ask about the firm" : "Ask about your work",
      admin
        ? "Sage reads your books: invoices, payments, requests and clients. The figures come from the records, not from the AI. So they are exact."
        : "Sage reads the requests assigned to you: their status, open asks and drafts. It shows no amounts.",
      { route: sagePage(role), page: "Sage", icon: "barChart", showEstimate: true },
    ),
    {
      key: "ask",
      target: COMPOSER,
      placement: "top",
      title: "Ask Sage",
      content: admin ? "Let us find the invoices that are late." : "Let us find your assigned work.",
      icon: "send",
      action: {
        kind: "ask",
        label: "Ask Sage",
        text: admin ? "Which invoices are overdue?" : "What work is assigned to me?",
        waiting: "Sage is reading the records.",
      },
    },
    {
      key: "answer",
      target: ANSWER,
      placement: "auto",
      title: "Figures from the records",
      content: "Each line comes from a record. Click a link to open that record.",
      icon: "fileText",
    },
    ...(admin
      ? [
          {
            key: "scope",
            target: '[data-tour="sage-scope"]',
            title: "One client at a time",
            content: "Set the scope to One client and pick the client. Sage then reads only that client's records.",
            icon: "filter",
          } satisfies TourStep,
        ]
      : []),
    {
      key: "turn",
      target: COMPOSER,
      placement: "top",
      title: "Your turn",
      content: "Ask about your own records.",
      icon: "pointer",
      action: {
        kind: "turn",
        examples: admin
          ? ["Who still owes us money?", "Which requests are waiting on the client?", "When was the last backup?"]
          : ["Which requests are waiting on the client?", "Which requests are mine?", "How do I accept a proposal in the workbench?"],
      },
    },
    done(admin ? "You asked about the firm's records. Next: let Sage prepare work for you." : "You asked about your work. Next: Sage in the workbench."),
  ];
}

function lessonPlans(): TourStep[] {
  return [
    centerStep(
      "intro",
      "Let Sage prepare the work",
      "Sage can prepare a quote, an invoice or a status change. It never does this alone. It shows a plan, and you confirm or dismiss it.",
      { route: "/admin/sage", page: "Sage", icon: "handshake", showEstimate: true },
    ),
    {
      key: "ask",
      target: COMPOSER,
      placement: "top",
      title: "Ask for a quote",
      content: "Let us ask Sage to prepare a quote. Nothing is made until you confirm.",
      icon: "send",
      action: { kind: "ask", label: "Ask Sage", text: "Draft a quote of 250,000 naira for VAT filing", waiting: "Sage is preparing the plan." },
    },
    {
      key: "plan",
      target: `${ANSWER} [data-tour="sage-proposal"]`,
      placement: "auto",
      title: "The plan",
      content: "Read what Sage will do. Confirm makes the record as a draft. Dismiss stops it.",
      icon: "check",
    },
    {
      key: "dismiss",
      target: `${ANSWER} [data-tour="sage-proposal"]`,
      placement: "auto",
      title: "Dismiss this one",
      content: "This is practice, so we dismiss it. The tour presses Dismiss for you.",
      icon: "trash",
      action: { kind: "click", label: "Dismiss it", selector: `${ANSWER} [data-tour="sage-proposal-dismiss"]` },
    },
    centerStep(
      "after",
      "Nothing was made",
      "When you confirm a plan, Sage makes a draft. You check it in Billing before it goes to the client. The audit log keeps who confirmed it, and when.",
      { icon: "shieldCheck" },
    ),
    done("You saw a plan and dismissed it. Next: Sage in the workbench."),
  ];
}

/** Phones: the tour opens the Sage sheet, so the next stops can point into it. */
const openSage = (): TourStep => ({
  key: "open-sage",
  target: '[data-tour="wb-sage-tab"]',
  mobileOnly: true,
  title: "Open Sage",
  content: "On a phone, Sage sits behind this tab. The sheet keeps its place.",
  icon: "sparkles",
  action: { kind: "click", label: "Open Sage", selector: '[data-tour="wb-sage-tab"] [role="radio"]:last-child', wait: WB },
});

function lessonWorkbench(): TourStep[] {
  return [
    centerStep(
      "intro",
      "Sage in the workbench",
      "This is your practice workbook: a trial balance for a made-up company. Edit it and ask Sage freely. No client data is here.",
      { route: "@practice", page: "Practice workbook", icon: "fileStack", showEstimate: true },
    ),
    {
      key: "grid",
      target: '[data-tour="wb-grid"]',
      placement: "auto",
      title: "The sheet",
      content: "It works like Excel. Click a cell to read it. Type to change it. Each edit saves as a new version.",
      icon: "layout",
    },
    {
      key: "select",
      target: '[data-tour="wb-grid"]',
      placement: "auto",
      title: "Select cells",
      content: "Sage reads what you select. Words like \"these cells\" or \"this column\" mean your selection.",
      icon: "pointer",
      action: { kind: "select", label: "Select C2:C20", range: "Sheet1!C2:C20" },
    },
    {
      key: "namebox",
      target: '[data-tour="wb-namebox"]',
      title: "Where you are",
      content: "The name box shows the selection. You can also type a cell or a range here, for example D21.",
      icon: "search",
      optional: true,
    },
    openSage(),
    {
      key: "ask-sum",
      target: WB,
      inDialog: true,
      placement: "left",
      title: "Ask about the selection",
      content: "Let us ask Sage to add up the selected cells.",
      icon: "send",
      action: { kind: "ask", label: "Ask Sage", text: "Add up these cells", surface: "workbench" },
    },
    {
      key: "answer",
      target: WB,
      inDialog: true,
      placement: "left",
      title: "Sage used your selection",
      content: "Sage read C2:C20 only. The total comes from the sheet, not from the AI. Click a cell name in the answer to jump to it.",
      icon: "lightbulb",
    },
    {
      key: "ask-change",
      target: WB,
      inDialog: true,
      placement: "left",
      title: "Ask for a change",
      content: "Sage can also write to the sheet. It shows the change first, and you accept or reject it.",
      icon: "penSquare",
      action: {
        kind: "ask",
        label: "Ask Sage",
        text: "In B23 write Difference, and in C23 put a formula for total debits minus total credits",
        surface: "workbench",
        waiting: "Sage is preparing the change.",
      },
    },
    {
      key: "proposal",
      target: '[data-tour="wb-proposal"]',
      inDialog: true,
      placement: "auto",
      title: "Check, then accept",
      content: "The change shows on the sheet in colour. Accept keeps it. Reject drops it. This is the practice workbook, so accept it.",
      icon: "badgeCheck",
      interact: { hint: "Click Accept.", clickTarget: '[data-tour="wb-accept"]' },
    },
    {
      key: "undo",
      target: '[data-tour="wb-undo"]',
      desktopOnly: true,
      title: "Undo at any time",
      content: "Changed your mind? Undo takes the change back. Every version stays in the history, so nothing is lost.",
      icon: "replay",
      optional: true,
    },
    {
      key: "turn",
      target: WB,
      inDialog: true,
      placement: "left",
      title: "Your turn",
      content: "Ask Sage to do something with this sheet.",
      icon: "pointer",
      action: {
        kind: "turn",
        surface: "workbench",
        examples: ["Make the header row bold", "Which expense account is the largest?", "Do the debits and credits balance?"],
      },
    },
    done("You selected cells, asked Sage, and accepted a change. Next: teach Sage your rules."),
  ];
}

function lessonRules(): TourStep[] {
  return [
    centerStep(
      "intro",
      "Teach Sage your rules",
      "Each workbook has its own instructions. Sage reads them before every answer in that workbook.",
      { route: "@practice", page: "Practice workbook", icon: "lightbulb", showEstimate: true },
    ),
    openSage(),
    {
      key: "button",
      inDialog: true,
      target: '[data-tour="wb-instructions"]',
      title: "Instructions",
      content: "A dot on this button shows that the workbook has instructions.",
      icon: "penSquare",
      interact: { hint: "Click Instructions." },
    },
    {
      key: "box",
      target: '[data-tour="wb-instructions-box"]',
      inDialog: true,
      placement: "auto",
      title: "Write your rules",
      content: "Write one rule on each line. For example: \"Show amounts in naira thousands.\" or \"Use the account names from column B.\" Save, then ask again: Sage uses the rule. Close the panel to go on.",
      icon: "fileText",
    },
    done("Sage now follows your rules in this workbook. Next: files and archives."),
  ];
}

function lessonFiles(): TourStep[] {
  return [
    centerStep(
      "intro",
      "Files and archives",
      "Give Sage the papers: spreadsheets, CSV, PDF, Word and pictures, up to 20 MB each.",
      { route: "@practice", page: "Practice workbook", icon: "fileStack", showEstimate: true },
    ),
    openSage(),
    {
      inDialog: true,
      key: "attach",
      target: '[data-tour="wb-attach"]',
      title: "Add a file",
      content: "Click here to choose files. You can also drop files on the Sage panel, or paste a screenshot into the box.",
      icon: "plus",
    },
    centerStep(
      "archives",
      "ZIP, RAR and 7z",
      "Send a folder of papers as one archive. Sage unpacks it into the workbench. If the archive has a password, Sage asks for it once and does not keep it.",
      { icon: "shieldCheck" },
    ),
    centerStep(
      "long-text",
      "Long text",
      "Paste a long email or a long note into the box. Sage keeps it as a .txt file, so your question stays short and clear.",
      { icon: "fileText" },
    ),
    done("You know how to give Sage the papers. Next: steer the answer."),
  ];
}

function lessonSteer(role: Role): TourStep[] {
  return [
    centerStep(
      "intro",
      "Steer the answer",
      "You control each answer: copy it, ask again, rate it, or reply to it.",
      { route: sagePage(role), page: "Sage", icon: "compass", showEstimate: true },
    ),
    {
      key: "ask",
      target: COMPOSER,
      placement: "top",
      title: "Get an answer",
      content: "First, an answer to work with.",
      icon: "send",
      action: {
        kind: "ask",
        label: "Ask Sage",
        text: role === "admin" ? "Which bank transfers are waiting for confirmation?" : "Which requests are mine?",
        waiting: "Sage is reading the records.",
      },
    },
    {
      key: "actions",
      target: `${ANSWER} [data-tour="sage-actions"]`,
      title: "The answer tools",
      content: "Copy the answer. Regenerate for a new one. Good or Bad, with a short note, tells us what to fix. Reply puts this answer in your next question.",
      icon: "settings",
    },
    {
      key: "history",
      target: '[data-tour="sage-history"]',
      desktopOnly: true,
      placement: "right",
      title: "Your chats",
      content: "Sage keeps every chat. Search old chats here, or start a new chat for a new subject.",
      icon: "clock",
    },
    {
      key: "history-phone",
      target: '[data-tour="sage-history-button"]',
      mobileOnly: true,
      title: "Your chats",
      content: "Sage keeps every chat. Open this to search old chats or start a new one.",
      icon: "clock",
    },
    done("You can steer every answer. Last lesson: when things go wrong."),
  ];
}

function lessonTrouble(role: Role): TourStep[] {
  return [
    centerStep(
      "intro",
      "When things go wrong",
      "Sage tells you what happened and keeps your question. Here is what to expect.",
      { route: sagePage(role), page: "Sage", icon: "lifeBuoy", showEstimate: true },
    ),
    {
      key: "stop",
      target: COMPOSER,
      placement: "top",
      title: "Stop a long answer",
      content: "While Sage works, Send changes to Stop (a square). Press it to end the answer.",
      icon: "pointer",
    },
    centerStep("offline", "No network", "Your question waits on this device. It sends by itself when you are back online.", { icon: "activity" }),
    centerStep(
      "busy",
      "A busy model",
      "If a model is slow or busy, Sage moves to the next one and says so under the answer. You do not need to ask again.",
      { icon: "gauge" },
    ),
    centerStep(
      "not-connected",
      "Sage is not connected",
      role === "admin"
        ? "Then Sage cannot answer. Check the AI engine in Settings, Integrations. Your old chats stay readable."
        : "Then Sage cannot answer. Tell an admin. Your old chats stay readable.",
      { icon: "cable" },
    ),
    done("That is all of Learn Sage. Open the lessons again at any time from the ? menu."),
  ];
}

const META: Array<{ slug: string; title: string; summary: string; roles: Role[]; build: (r: Role) => TourStep[] }> = [
  { slug: "ask", title: "Ask anything", summary: "Ask a tax question, then check the sources.", roles: ["admin", "staff"], build: lessonAsk },
  { slug: "firm", title: "Ask about your records", summary: "Exact figures from the records, with links.", roles: ["admin", "staff"], build: lessonFirm },
  { slug: "plans", title: "Let Sage prepare the work", summary: "A plan you confirm or dismiss. Nothing is made alone.", roles: ["admin"], build: () => lessonPlans() },
  { slug: "workbench", title: "Sage in the workbench", summary: "Select cells, ask, accept a change, undo.", roles: ["admin", "staff"], build: () => lessonWorkbench() },
  { slug: "rules", title: "Teach Sage your rules", summary: "Instructions that Sage follows in a workbook.", roles: ["admin", "staff"], build: () => lessonRules() },
  { slug: "files", title: "Files and archives", summary: "Papers, screenshots, ZIP files with passwords.", roles: ["admin", "staff"], build: () => lessonFiles() },
  { slug: "steer", title: "Steer the answer", summary: "Copy, regenerate, rate, reply, old chats.", roles: ["admin", "staff"], build: lessonSteer },
  { slug: "trouble", title: "When things go wrong", summary: "Offline, a busy model, Stop.", roles: ["admin", "staff"], build: lessonTrouble },
];

export const LESSONS: Record<string, TourDef> = Object.fromEntries(
  META.flatMap((m) =>
    m.roles.map((role) => {
      const id = `${role}-lesson-${m.slug}`;
      const def: TourDef = { id, audience: role, kind: "lesson", version: 1, title: m.title, summary: m.summary, steps: m.build(role) };
      return [id, def] as const;
    }),
  ),
);

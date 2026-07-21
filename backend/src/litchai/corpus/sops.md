# Litch Consulting — Internal Standard Operating Procedures

These SOPs are firm-internal guidance for staff using the admin platform. They
describe how work moves through the system, not client-facing policy.

## Engagement lifecycle

An engagement moves through a fixed state machine: open, in review, approved, and
locked, with reopen and reject paths back to open. Documents are compiled into a
formula-driven workbook while the engagement is open. When the work is ready it is
submitted for review; an approver either approves it (which freezes the generated
files as deliverables) or rejects it back to open with notes. A locked engagement
must be reopened before any further correction. Never edit figures directly in a
generated workbook — corrections flow through the review and recategorisation loop
so every change is audited.

## Handling client documents

Client financial documents are uploaded through the blind relay: they are
encrypted with the analysis VM's public key the instant they arrive, and only the
ciphertext is forwarded. Staff must never paste raw statement contents into
tickets, notes or chat. Duplicate uploads are detected by ciphertext hash and are
not re-processed. If a client requests erasure, run the erasure flow, which
deletes their documents, line items, engagements and client-scoped memory.

A document can be deleted from a request from the admin request page; deleting a
client upload removes the row and the stored file, and the client no longer sees
it. If a document is not a transactional source — for example a blank annual-
report or statement template with no date, description and amount rows — the
extractor rejects it and the analysis shows "Extraction failed" with the reason.
That is expected behaviour, not a fault: ask the client for the actual
transaction listing (bank statement, ledger, or sales/expense/payroll register).
Documents can never be left stuck at "Extracting": a background self-heal marks
any stalled document as failed within a few minutes so it always shows a reason
and a Reanalyze button.

## Returning a document for correction

When a client uploads the wrong or an incomplete document, use "Request
correction" on that document rather than a private note. This records a reason
the client can see, posts it to their request timeline, and emails them to re-
upload. The client sees an amber banner on that document slot and re-uploads a
corrected version, which replaces the old file and clears the flag. Use this
whenever a client needs to provide a different or complete document — it is the
proper channel for document feedback, in place of an internal-only note.

## Keeping the client informed

Clients see plain-English progress on their request — "Documents under review",
"Documents processed", and "Needs your attention" — while the documents are
analysed; the AI pipeline is never named to the client. Clients and advisors can
also message each other on a request: the client posts from their workspace and
the advisor replies with a visible-to-client note. Use the visible-to-client note
or the correction flow (not an internal note) whenever the client needs to see or
act on something. Internal notes stay private to staff.

## Categorisation review

Transaction lines are categorised by a four-rung ladder (exact match, trigram,
vector, then a constrained LLM). Lines the ladder is unsure about are flagged for
human review and ranked by risk and novelty. Reviewers confirm or recategorise
flagged lines; every correction is written to the audit trail and to category
memory so the system learns. Only categories from the current taxonomy may be
assigned.

## Invoicing

Invoices are built in the admin invoice builder, previewed as live HTML, and
rendered to a branded PDF. Money totals are always recomputed server-side — never
trust a client-supplied total. Invoices are sent by email and expose a public pay
page; receipts reuse the same PDF layout in receipt variant. VAT is applied at the
current standard rate (7.5%).

## Tax rates

All tax computations read the firm's single versioned Nigeria tax configuration
(PAYE bands, VAT, WHT, CIT and Development Levy, pension and NHF). Never hardcode a
rate anywhere. When a Finance Act changes a rate, update the configuration and bump
its version; the version is recorded in every generated file for traceability.

## Support and help desk

Client support requests arrive as tickets in the Help Desk. Assign each ticket to
an owner, keep the status current, and resolve within the agreed response window.
Link tickets to the relevant engagement or invoice where possible so context
travels with the request.

## Compiling a workbook from Analyses

Sending a document to LitchAI (the "Analyze" button on a request) only ingests,
scans and categorises it — it does not by itself produce the client's Excel
deliverable. From the document's Review workspace in AI Studio (Admin → Analyses),
use "Compile workbook": pick an output template (currently Annual report IAS 1 or
IFRS 18), give it a period label such as "FY 2025", and optionally a materiality
threshold. This creates an engagement, attaches the document, and compiles a
formula-driven Excel workbook in one step. The compiler always recomputes every
formula (LibreOffice) and gates on the result — any `#REF!`/`#DIV/0!`-style error
is surfaced in the compile report before anyone signs off, so a broken formula
never silently reaches a client. The report also lists anomalies (outliers, sign
issues, broken subtotals) and section-total summaries. If a document already has
an engagement, the same panel offers "Recompile" — useful after making
corrections in the review grid. Once compiled, approve the engagement in the
sign-off panel, then publish the verified workbook as the request's deliverable
(client is notified by email). Only the two annual-report templates have a
compiler wired to this pipeline today; the other output types (P&L, cashflow,
bank reconciliation, aging, CIT, VAT, WHT, payroll, ledger, CAC tracker,
statement of affairs) exist as compilers but are not yet reachable this way.

## AI-assisted editing in the spreadsheet

From a Review workspace, "Open in editor" opens the underlying file in the
in-browser spreadsheet editor with an AI side panel ("Sage in the sheet"). Select
a range of cells and run one of six commands: Explain this, Write/fix a formula,
Clean & normalise, Add a derived column, Flag anomalies, or Categorise rows. The
assistant only ever sees the selected cells (never the whole workbook) and
proposes edits as a preview — nothing is written until you apply it (or disable
"Ask before edits" to apply immediately). Every applied edit is instantly
recalculated by the browser's own formula engine and any resulting error is
flagged right there, so a bad formula is caught before it's saved. Editing here
produces a **working copy** you can save to the request, clearly marked
unverified — it is never the client-facing deliverable. The verified deliverable
always comes from compiling the engagement (see above) and publishing from the
request's AI panel.

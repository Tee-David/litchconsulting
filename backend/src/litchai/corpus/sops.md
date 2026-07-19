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

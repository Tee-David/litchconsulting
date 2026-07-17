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

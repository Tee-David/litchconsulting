# The workbench — working on client spreadsheets with Sage

These notes describe the workbench: the spreadsheet editor where an admin opens a
client's files and works on them with Sage beside the grid. Open it from a request
("Open in workbench") or from Analyses.

## What the workbench reads

The workbench reads the whole workbook, every sheet of every attached file, so you
never need to select a range first. Spreadsheets (xlsx and csv) open as they are. A
PDF bank statement or ledger opens as a sheet built from its extracted rows, with
the source page kept for each row. When files open, Sage shows a first look: what
each sheet holds, how many rows, date span, totals, duplicates, dates typed as text,
and suggested next steps such as "Reconcile bank to ledger" or "Build the P&L". The
first look needs no AI model; it is computed directly from the file.

## How Sage works in the workbench

Sage plans the steps, calls the workbench tools, checks each result and writes the
answer. Every number comes from a tool, never from the model's own arithmetic, and
the answer cites the cells it came from (for example Ledger!E2 or 'P&L'!C24). The
steps are shown live as Sage works: the plan, each tool it ran, and the result. Sage
uses at most eight steps for one request. If no AI model is reachable, the workbench
still runs the deterministic steps for common requests (reconcile, categorise,
statements, anomaly checks) and says so.

## Tools the workbench can use

Read tools: profile the workbook or a range, run a read-only SQL query over the
sheets, flag anomalies (duplicates, outliers, large round amounts, weekend postings,
text dates and text numbers, running-balance breaks, Benford's law), and compute
Nigerian tax (CIT with development levy, VAT, WHT and PAYE) from the firm's tax
config. Write tools: categorise rows, build a P&L, balance sheet or cash flow
statement linked to the source rows by formulas, pivot tables, formula columns,
native Excel charts, bank-to-ledger reconciliation, converting text dates and text
numbers to real values, and new sheets or new workbooks.

## Proposals: accept, edit, reject, undo

Nothing Sage does changes the file until you accept it. Every write comes back as a
proposal: new cells, changed cells and new sheets are highlighted in the grid, each
with a "why" note showing the tool, the reason and the source rows. Accept applies
it and recalculates the workbook; if a formula would break (for example #REF!), the
accept is blocked and the previous version is kept. You can edit a proposed cell
before accepting, reject the proposal, or undo an accepted one later. Every accepted
change makes a new version of the workbook, and any earlier version can be
downloaded. A proposal that overwrites existing source values is marked risky so it
gets a closer look.

## Privacy in the workbench

The workbench follows the client's AI mode. For a client on cloud (masked), only
masked samples reach the cloud model: names, account numbers, phone numbers, emails,
BVNs and TINs are replaced with tokens such as [NAME_1] before anything leaves the
server, and real values are restored only in what you see. For a client on local
only, nothing leaves the analysis server; Sage uses the local model, which is slower.
The engine panel shows which model answered, whether a fallback happened, and how
much of each provider's daily free quota is used.

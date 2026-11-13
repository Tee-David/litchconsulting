# The workbench — working on client spreadsheets with Sage

These notes describe the workbench: the spreadsheet editor where an admin opens a
client's files and works on them with Sage beside the grid. Admins open it from a
request ("Open in workbench") or from Analyses, where recent workbench threads are
listed and a new blank workbook can be started. Staff open it from Files in their
workspace, only for requests assigned to them. On a phone, the Sheet / Sage switch
shows the grid or the chat; Sage opens as a sheet from the bottom.

Final actions are in the workbench header: Download XLSX, and Send to client, which
saves the file to the request as a draft, sends it for client review (the next review
round), or publishes it as the final deliverable. Every one of them recomputes the
workbook first; if a formula errors, nothing is released and the cells are listed.
Voice: hold the microphone button in the composer to talk; the words appear in the
text box to edit before sending. Voice is off for clients set to local only, because
the browser's speech recognition sends audio to an outside service.

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

Nothing Sage does changes the file until you accept it. (Your own typed edits, pastes and
formats are not proposals: they save at once as a new version; see "Editing cells
yourself".) Every write from Sage comes back as a proposal: new cells, changed cells and new sheets are highlighted in the grid, each
with a "why" note showing the tool, the reason and the source rows. Accept applies
it and recalculates the workbook; if a formula would break (for example #REF!), the
accept is blocked and the previous version is kept. You can edit a proposed cell
before accepting, reject the proposal, or undo an accepted one later. Every accepted
change makes a new version of the workbook, and any earlier version can be
downloaded. A proposal that overwrites existing source values is marked risky so it
gets a closer look.

## Editing cells yourself

How to type in a cell, edit a value, enter a formula, paste from Excel or Google Sheets,
clear cells, change the number format and undo your own edits in the workbench. Admins,
and staff on requests assigned to them, can edit the sheet directly, like in Excel or
Google Sheets; these edits save at once and are not proposals. Select a cell and type, or press F2 or double-click to change
what is there; Enter saves and moves down, Tab saves and moves right, Esc cancels. You
can also edit in the formula bar. A value starting with = is a formula; while you type,
a list of functions (SUM, SUMIF, VLOOKUP, XLOOKUP, INDEX, MATCH, IF and many more)
appears with the arguments each one needs, and Tab inserts the one you pick. 1,250.50,
₦1,000 and 15% are read as numbers. Delete clears the selected cells, Ctrl+V pastes
rows and columns copied from Excel or Sheets, and Ctrl+X cuts. The toolbar sets the
number format of the selection: Naira, percent, thousands separator, more or fewer
decimals, or a plain number. Your own edits are saved at once as a new version named
after you ("Edited by …"), recalculated by the engine, and Undo and Redo (Ctrl+Z,
Ctrl+Y) step back and forward through them. Sage's changes are different: they stay
proposals until someone accepts them. The sheet shows 100 empty rows and 3 empty
columns past the data, so you can add data below or beside it.

## Moving around the sheet

Zoom from 50% to 200% with the buttons at the bottom right, Ctrl and the mouse wheel,
or Ctrl and plus or minus; Ctrl+0 goes back to 100%. Pan with the scroll wheel (Shift
for sideways), a trackpad, or by holding Space (or the middle mouse button) and
dragging. Click a column letter or row number to select the whole column or row, and
drag the right edge of a column letter to resize it (double-click resets it). The
status bar shows the Sum, Average, Min, Max and Count of the selection. Ctrl+F finds
text in the sheet, the name box goes to a cell or range such as D14 or B3:D8, and the
View menu freezes the first row or column and shows formulas instead of values
(Ctrl+`). Right-click a cell to copy, copy values only, select its row or column, or
ask Sage about the range. The layout can be Split (sheet and Sage side by side, with
a divider you can drag), Focus (the sheet fills the editor and Sage opens inside it
with Ctrl+J) or Full screen; your choice is kept.

## Privacy in the workbench

The workbench follows the client's AI mode. For a client on cloud (masked), only
masked samples reach the cloud model: names, account numbers, phone numbers, emails,
BVNs and TINs are replaced with tokens such as [NAME_1] before anything leaves the
server, and real values are restored only in what you see. For a client on local
only, nothing leaves the analysis server; Sage uses the local model, which is slower.
The engine panel shows which model answered, whether a fallback happened, and how
much of each provider's daily free quota is used.

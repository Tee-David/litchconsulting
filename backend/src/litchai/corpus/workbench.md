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
the source page kept for each row. When files open, Sage shows a job overview: what
each file is (trial balance, bank statement and which bank, ledger, invoices,
payroll), its period, rows and totals, then the first checks that fit the files (the
books, sales, invoices, payroll or grant checks) with the top points found. The
workbench opens the most useful file first: the trial balance or books, then the bank
statements, then the ledgers. Sage then asks "What would you like me to do?" with
buttons such as "Check the books and list the adjustments needed", "Reconcile the
GTBank statement to the books" or "Prepare the financial statements and the tax". Sage
does not start a task by itself. The overview needs no AI model and changes nothing.

## How Sage works in the workbench

Sage plans the steps, calls the workbench tools, checks each result and writes the
answer. Every number comes from a tool, never from the model's own arithmetic, and
the answer cites the cells it came from (for example Ledger!E2 or 'P&L'!C24). The
steps are shown live as Sage works: the plan, each tool it ran, and the result. Sage
uses at most eight steps for one request. If no AI model is reachable, the workbench
still runs its built-in checks for common requests (reconcile, categorise,
statements, anomaly checks). Every answer has one style: the answer first in one or
two sentences, then the figures with their source cells, then the next step. When a
request is not clear, Sage asks one short question with a few choices. When Sage
cannot finish, it says so plainly and says that nothing was changed.

## Tools the workbench can use

Read tools: profile the workbook or a range, run a read-only SQL query over the
sheets, flag anomalies (duplicates, outliers, large round amounts, weekend postings,
text dates and text numbers, running-balance breaks, Benford's law), and compute
Nigerian tax (CIT with development levy, VAT, WHT and PAYE) from the firm's tax
config. Write tools: categorise rows, build a P&L, balance sheet or cash flow
statement linked to the source rows by formulas, pivot tables, formula columns,
native Excel charts, bank-to-ledger reconciliation, converting text dates and text
numbers to real values, and new sheets or new workbooks.

## Financial analysis from a trial balance

When a trial balance is open, ask for a "financial analysis" (or ratios, margins,
liquidity, working capital, gearing). Sage builds one new sheet, named "Financial
Analysis" unless you name it, with four sections: Profitability Analysis (revenue,
cost of sales, gross profit and margin, operating expenses, operating profit and
margin, interest, profit before tax, net margin), Liquidity Analysis (current assets
and liabilities, working capital, current, quick and cash ratios), Asset Analysis
(PPE cost, accumulated depreciation, net book value, total assets and liabilities,
debt to equity, gearing, interest cover), returns and efficiency (ROA, ROE, asset
turnover, receivable, payable and inventory days) and Validation Checks (debits equal
credits, the balance sheet balances, working capital positive, current ratio at least
1.0, each PASS or FAIL). Every figure is a live formula over the trial balance cells,
so a change in the TB flows through. If the TB has no tax account, the tax line is an
estimate from the tax config. Sage can also list the TB accounts with their exact
cells (tb_lines) before it writes a formula. The job runs without an AI model, so it
works even when the models are busy.

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
columns past the data, so you can add data below or beside it. Drag the small square at
the corner of the selection (the fill handle) to copy cells or continue a series such
as 1, 2, 3 or Jan, Feb, Mar; double-click it to fill down as far as the next column has
data. Formulas move their cell references as they fill.

## Saving, working offline and version history

How saving works, what happens without internet, and how to see, preview or restore
an earlier version of a workbook. Every edit saves at once; the toolbar says
"Saving…", then "All changes saved". If the connection drops, your edits stay on this
device ("Offline: N changes kept on this device") and are sent, in order, when the
connection returns or when you open the workbench again; the browser asks before you
leave while a save is still running. The Versions button lists every version of the
workbook, newest first, with who made it (your name for your edits, "Sage: …" for an
accepted proposal, "Undo: …" for an undo, "Restored version N by …" for a restore),
when, and whether the recompute passed. Preview shows that version in the grid,
read-only; Restore this version brings it back as a new version, so nothing is lost
and Ctrl+Z undoes the restore. Any version can also be downloaded.

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

## Rows, columns, sorting, filtering and formatting

Right-click a cell to insert rows above or below, insert columns left or right, or
delete the selected rows or columns. Formulas on every sheet follow the change, as in
Excel. If a formula still points at the rows or columns you delete, the workbench
refuses and names those cells, so nothing turns into #REF!; change those formulas first.
Each change is a version, and Ctrl+Z undoes it.

To sort, select the rows (with their header), right-click a cell in the column to sort
by, and choose Sort A to Z or Sort Z to A. A header row stays on top, numbers come
before text, blanks go last, and formulas move with their row. To filter, right-click a
cell and choose "Show only rows where ... is ...": the other rows are hidden from view
only (nothing in the file changes), and a bar at the top shows how many rows are shown,
with Show all rows to clear it.

Copy and paste inside the workbench keeps formulas and number formats: a copied formula
moves with the paste, like =A2*2 becoming =A3*2 one row down. Cut and paste moves the
formula unchanged. Text pasted from another program arrives as values.

The toolbar formats the selected cells: bold, italic, underline, text colour, fill
colour, align left, centre or right, wrap text, and borders (all, outside, top, bottom
or none). Select two or more cells and use Merge to merge them; right-click a merged
cell to unmerge it. Formatting is saved in the Excel file, is a version, and can be
undone. Sage can also format cells when you ask, for example "make the header row bold
with a light fill and a bottom border"; it proposes the change for you to accept.

## Adding files, archives and working offline

The workbench takes XLSX, XLSM, XLS, ODS, CSV, TSV, TXT, JSON, DOCX, PDF, PNG and JPG files up to 20 MB each,
and ZIP, RAR (RAR4 and RAR5) or 7z archives of them. An archive with a password asks for it; the password
is used once to open the files and is never kept. Each file inside is virus-scanned and read like any
upload; files the workbench cannot read, empty files and archives inside the archive are listed as skipped.
PDFs and screenshots are read by OCR and appear when ready.

Offline, an open workbench still reads from the copy on this device, and edits are kept and sent when
the connection is back. If someone changed the same cell meanwhile, you choose Keep mine or Keep theirs
for each cell. A question to Sage asked offline waits and sends by itself. Signing out deletes the copy.

## Privacy in the workbench

The workbench follows the client's AI mode. For a client on cloud (masked), only
masked samples reach the cloud model: names, account numbers, phone numbers, emails,
BVNs and TINs are replaced with tokens such as [NAME_1] before anything leaves the
server, and real values are restored only in what you see. For a client on local
only, nothing leaves the analysis server; Sage uses the local model, which is slower.
The engine panel shows which model answered, whether a fallback happened, and how
much of each provider's daily free quota is used.

## Year-end work: journals, adjusted trial balance, loan and depreciation

Sage can post adjusting journals as a proposal. Each journal must balance, or Sage
refuses it. All journals go on a "Journals" sheet (number, date, account, debit,
credit, reason and source), and an "Adjusted TB" sheet shows, for every account, the
bookkeeper's balance plus the adjustments, which gives the final debit or credit.
Every figure there is a formula, and the sheet shows PASS when debits equal credits.
A journal can use a new account by giving its code and name (for example "1240 Cash
in transit"). After the adjusted TB exists, the statements, the financial analysis
and the tax computation use it instead of the original TB. Sage can also build a loan
schedule from the loan terms (monthly interest on the opening principal, fixed
principal repayments, interest accrued to the year end by days, and the fee) and a
depreciation schedule from the fixed asset register plus new assets (straight line,
a full month in the month bought). Colour rules (conditional formatting) can mark
PASS in green and FAIL in red, or negatives in red.

## Sheet actions Sage can do

Ask Sage to delete, rename, copy, move, hide or show sheets, change a tab colour,
insert or delete rows and columns, merge cells or remove a chart. Several changes go
in one proposal. Sage understands sets such as "all the other sheets", "the sheets
Sage made", "the empty sheets" and "the hidden sheets". Before a delete, Sage checks
for formulas on the other sheets that point at the sheet. If there are some, Sage asks
first: keep those figures as values, or delete anyway (they then show #REF!). Sage
never deletes the last visible sheet. A delete is always a high-risk proposal, and
the proposal names any sheet that came from an uploaded file. Undo brings a deleted
sheet back with its values, formulas, formats and position.

## Range actions Sage can do

Sage can sort a table (rows stay together; the header and total rows stay in place),
find and replace text (it says how many cells change, and it refuses when nothing
matches), clear a range, copy or move a range (formulas follow, as in Excel), set a
number format on a range (naira, number, percent, date), style a range (bold, fill,
borders), set column widths, freeze panes, add a filter, and add a drop-down list
(data validation). Ask for several at once, for example "bold the header, freeze row
1, sort by date and show column D in naira": Sage makes one proposal for all of them.
Undo restores the cells and the layout.

## Tracing a figure and goal seek

Ask Sage "where does this number come from" or "what uses this cell". Sage shows the
cell's formula, the cells it reads with their values (a few levels deep), and every
formula on any sheet that uses the cell. Ask Sage to goal seek, for example "what
revenue gives a profit before tax of 50 million": Sage recomputes the whole chain and
proposes the one input value that reaches the target.

## Files in a job: labels, notes and ZIP files

Add several files at once, or one ZIP, RAR or 7z archive (with or without a
password). Each file becomes its own workbook, and files from one archive stay
grouped under the archive's name. The workbench labels each file by itself: bank
statement (and which bank), trial balance, ledger or cash book, invoices, payroll,
fixed asset register, sales or settlement report, letter or contract, or books with
several schedules. It also notes the period and the number of rows. You can correct a
label and add a short note on what the file is for, for example "use for the bank
rec". Sage sees one line per file with its label and your note, so you can say "use
the GTBank statement" or "take the terms from the loan letter". Sage reads the text
of letters, PDFs and DOCX notes with page numbers.

## Year-end bank reconciliation against the trial balance

Add the bank statement (CSV, Excel or PDF) and the books with the trial balance, then
ask Sage to reconcile, for example "reconcile the GTBank statement to the trial
balance". Sage takes the statement's closing balance and the TB bank account, and
explains the difference: cheques in the cheque register that are not on the
statement (unpresented), and bank charges on the statement that are not in the books.
Anything left is shown as "not explained", never forced to zero. The reconciliation
is a proposal on a new sheet, with the source of each figure.

## Year-end review

Ask "do the year-end review" (or "identify the adjustments required before the final
accounts"). Sage runs a fixed plan, step by step, with no AI model needed: a Sources
sheet of every file, a bank reconciliation for each bank statement, depreciation from
the fixed asset register, review points found by rules (suspense, other income, a VAT
account in debit, capital items paid from the bank, personal items such as school
fees, a loan booked as income, missing depreciation, stock not moved), and the
statements and tax before adjustments. Each review point names its source and the
fix. Then tell Sage which points to post: it makes one journals proposal with an
adjusted trial balance.

## Checking sales data

When sales look wrong, ask Sage to check them. Sage runs the standard revenue checks
on POS exports, invoices, card settlements and cash banking sheets: duplicate lines
(for example an upload done twice), voided or reversed lines still in the totals, VAT
charged on exempt items such as basic food, cash banked below the till figure, cash
banked with no sales recorded, missing trading days, processor fees (missing when
sales are booked at the net payout), and sales dated after the books were closed.
Each finding gives the amount, the source and the fix.

## Checking invoices, contracts and donor grants

Ask Sage to check invoices, receivables or contracts: it looks for invoice numbers
posted twice, invoices with no VAT, advances or mobilisation billed as revenue, a
client whose WHT rate differs from the others, WHT with no credit note, retention not
recorded, billing ahead of certified work, and materials on site at the year end. For
an NGO or a donor project, ask Sage to review the books against the grant agreement:
it finds costs the donor does not allow, costs of another grant's purpose, staff costs
above the timesheet share, unspent restricted funds to defer, tranches meant for a
later year, and receipts not translated at the official rate on the day. The trial
balance review also flags bank charges on a statement that are not in the books.

## Payroll audit

Ask Sage to check the payroll. It looks for names paid that are not in the staff master
(ghost employees), one bank account paid for more than one name, pay after an exit
date, the same person paid twice in a month, pension not deducted, PAYE that differs
from the NTA 2025 bands in the firm's tax config, and payroll gross that does not match
salaries in the trial balance.


## Checks for imports, property, stock, settlements, groups and purchases

Sage has standard checks for more kinds of business. Ask in plain words, for example
"check our stock", "is our rent income right" or "review the purchases for fraud".
Each check names the problem, the amount, the file it came from and the fix.

- Imports: duty, freight and clearing expensed (they belong in the cost of stock),
  USD supplier balances not revalued at the 31 December rate, letter of credit
  charges in cost of sales, goods in transit at the year end.
- Property: rent received for later years taken as income, refundable tenant
  deposits taken as income, no 10% WHT on rent paid to a company, service charge
  mixed with rent.
- Stock: the count against the stock ledger, stock above its net realisable value,
  the weighted-average cost recomputed from the year's purchases, raw materials
  and finished goods in one account.
- Settlements (fintech, POS, agency banking): a batch settled twice, fees netted
  off income, chargebacks not booked, a day never settled.
- Group and director: personal costs paid by the company, intercompany balances
  that do not agree, a loan to the director, intercompany sales not eliminated.
- Purchases (fraud review): duplicate vendors (same bank account or near-identical
  names), payments split under the approval limit, round sums paid at weekends,
  missing payment voucher numbers, vendors with no TIN.

The job overview runs these checks when the files fit, and shows what they found.

## Sources and the working book

A workbench has two parts. **Sources** are the files you give: spreadsheets, CSVs,
PDFs, scans, letters and the files inside ZIP, RAR or 7z archives. Sage reads them
and cites them, but never changes them. The **working book** holds the sheets that you
and Sage make: reconciliations, journals, statements, schedules and charts.

Adding files makes no sheets. Sage lists the files, runs the checks that fit them and
asks what you want to do. The working book is made by the first result you accept,
or at once with "Start a blank sheet". When a result needs figures from a source (for
example statements from a trial balance), Sage brings in a read-only copy of that
source sheet, so the formulas stay live. Open any source to look at it: it opens read
only. Blank templates (an IFRS annual report form) are labelled as templates and are
not treated as client figures. When the files cover different periods, the overview
says so first. Under each answer, "Show technical details" shows the steps, tool names
and queries for people who want them.

## Pointing Sage at files, and what an answer used

Type @ in the message box to point Sage at a file, for example @GTBank statement. In
Your sources, "Ask about it" does the same, "Open" shows a file read only, and a search
box helps when there are many files. Under each answer, "Used:" names the files the
answer came from; click one to open it. An answer shows at most three cell links on a
line; "+N more" shows the rest. To edit a source's figures, open it and choose "Copy
this sheet into the working book"; the source file stays as it is.

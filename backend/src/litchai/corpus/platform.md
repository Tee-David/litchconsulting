# Admin platform — billing, privacy, requests and backups

Internal guidance for the admin platform features added in the redesign.

## Confirming bank transfer payments

Clients can pay an invoice by bank transfer and upload the transfer receipt as
proof on their billing page. This creates a pending payment and notifies the admins.
Open Billing, then Payments, and use the "To confirm" view to see transfers waiting
for you. Open the payment to view the proof file and check the amount, the narration
and the date against the banking app before you confirm. Confirm records the money
against the invoice; if a different amount arrived, enter the amount actually
received and the date it reached the account, and a short transfer becomes a part
payment with the balance still due. If you cannot find the money, reject it with a
reason: the client is told why and can upload proof again. Card and Paystack
payments confirm themselves. You can also record a payment manually with "Record a
payment", and export the payments list as CSV.

## Asking Sage to draft a quote or an invoice

Ask Sage, for example: "Create a quote for Acme Ltd for 500,000 naira for the audit".
Sage does not create anything on its own. It shows a proposal with the client, the
amount and what it is for. When you confirm, a DRAFT quote or invoice is saved for that
client, with VAT at the standard rate from the tax configuration. Nothing is sent. Open
Billing to check the draft, change it if necessary, and send it. If no client or more than
one client matches the name, Sage says so and asks for the full name.

## Deposits and part payments

A quote or invoice can ask for a deposit (a percentage of the total). The invoice
then shows the deposit due and what is still to pay, and each payment, Paystack or
bank transfer, reduces the balance. An invoice is paid when the amount paid reaches
the total.

## Client AI mode

Each client has an AI mode on the Privacy tab of the client page. Cloud (masked) is
the default: cloud models only ever see masked data, with names, account numbers and
other identifiers replaced by tokens. Local only means the client's data never leaves
the analysis server, which is slower. Changing the mode needs a reason, and who
changed it, when and why is kept in the audit log. The mode applies to Sage, the
workbench and help-desk triage for that client.

## Exporting a client's data

Under Data rights (NDPA 2023) on the client's Privacy tab, "Export everything"
downloads one JSON file with all the data held about the client: profile and portal
login, requests with their timeline, files, asks and review rounds, invoices with
their items, payments, support tickets and messages, notes and consultations. Use it when a client asks for a copy of
their data, and always before erasing if they asked for a copy.

## Erasing a client (NDPA, 30-day hold)

"Erase this client" on the Privacy tab schedules erasure after a 30-day hold. You
type "erase <client name>" to confirm. Nothing is deleted at once: the client's
portal is closed (their sessions are signed out and the portal shows the erasure
date), and the clients list tags them "Erasure pending". Anyone with access can
cancel during the hold, which opens the portal again. After 30 days the nightly sweep
erases the data. "Erase now" skips the rest of the hold, for a client already
scheduled who asked for it in writing. Erasure removes people, messages, files, asks,
notes, AI chats, the analysis data and the portal login. Invoices, quotes and
payments are kept for six years as tax law requires, with names, emails and
addresses removed. The erasure report (removed and kept) is saved in the audit log.
An erased client is never purged from Trash; the anonymous record anchors the kept
finance records.

## Asks: requesting information or documents

On a request, use Asks to ask the client for information or a document at any time.
Give a short title, optional detail and an optional due date. The client sees the ask
on their Home and answers it or uploads the file. An ask moves from open to supplied
(the client answered) to received (you marked it received). If the answer is not good
enough, re-open it; you can also cancel an ask or send a reminder. Marking an ask
received can be undone.

## Draft review rounds

To have the client review a draft deliverable, upload it as a draft and use "Send for
review". This opens review round 1 and the request shows client review. The client
either approves, which marks the request delivered, or asks for changes with
comments, which returns it to in progress. The next draft you send opens round 2, and
so on. Every round, with its decision and comments, is listed on the request.

## Assigning staff to requests

Admins assign requests to staff from the request list (select requests, then Assign)
or from the request page. Only admins and staff can be assigned, and a request can
have more than one person. A staff member only sees the requests assigned to them, in
their workspace at /work: their requests, the client conversations on them, and the
files. Staff never see amounts; payment shows only as a label such as paid or awaiting
payment.

## Backups and the restore test

The database is backed up nightly to the private storage bucket, and Settings, then
Backups, can run a backup on demand. "Run restore test" proves a backup can be
restored: it loads the newest snapshot into a fresh scratch database built with the
real schema, compares the row counts of every table with the snapshot, and then drops
the scratch database. It never touches the production database and takes up to a
minute. The result (each table's rows in the backup and restored) is kept in the
audit log and shown on the Backups page. Run it after schema changes and at least
monthly.

## Workbench file types and accounting schedules

The analyses workbench opens .xlsx and .xlsm files as they are. It makes an xlsx
working copy of every other file type and keeps the original unchanged. For .csv,
.tsv and .txt files, it detects the separator, the encoding, the decimal style and
the date order. A .json list of records becomes a table. Each table in a .docx file
becomes a sheet, and the text goes to a Notes sheet. LibreOffice converts .xls and
.ods files. The first look tells you which files were converted and what was lost.

The workbench co-pilot can also prepare seven accounting schedules as proposals:
debtors or creditors aging, a WHT schedule with the credit notes still to request,
a VAT return, a payroll with PAYE, pension, NHF and NSITF, a statement of affairs,
a CAC and compliance filing tracker, and an IAS 1 or IFRS 18 annual report pack.
Each one shows its basis: the rule, the rates and the tax-config version. Nothing
changes in the file until you accept the proposal, and the recompute check then
confirms every formula.

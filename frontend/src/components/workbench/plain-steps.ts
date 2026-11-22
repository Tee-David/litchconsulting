/**
 * Plain words for what Sage did, for people who are not technical (v8).
 * Each step has a "doing" form (live) and a "done" form (after). Tool names, SQL and
 * arguments are technical details: the trace shows them only when asked.
 */
type Words = { run: string; done: string };

const W: Record<string, Words> = {
  profile_workbook: { run: "Reading the files", done: "Read the files" },
  profile_range: { run: "Reading the selected cells", done: "Read the selected cells" },
  query_sql: { run: "Looking up figures in the files", done: "Looked up figures in the files" },
  categorise_rows: { run: "Sorting the transactions into categories", done: "Sorted the transactions into categories" },
  build_statement: { run: "Preparing a statement", done: "Prepared a statement" },
  pivot: { run: "Making a summary table", done: "Made a summary table" },
  write_cells: { run: "Preparing changes to the sheet", done: "Prepared changes to the sheet" },
  add_formula_column: { run: "Adding a calculated column", done: "Added a calculated column" },
  add_chart: { run: "Making a chart", done: "Made a chart" },
  reconcile: { run: "Matching the bank lines to the books", done: "Matched the bank lines to the books" },
  flag_anomalies: { run: "Looking for unusual entries", done: "Looked for unusual entries" },
  tax_compute: { run: "Working out the tax", done: "Worked out the tax" },
  create_sheet: { run: "Making a new sheet", done: "Made a new sheet" },
  create_workbook: { run: "Making a new workbook", done: "Made a new workbook" },
  clean_values: { run: "Fixing dates and numbers typed as text", done: "Fixed dates and numbers typed as text" },
  trial_balance_statements: { run: "Preparing statements from the trial balance", done: "Prepared statements from the trial balance" },
  financial_analysis: { run: "Working out the key ratios", done: "Worked out the key ratios" },
  conditional_format: { run: "Colouring cells by rule", done: "Coloured cells by rule" },
  range_actions: { run: "Preparing changes to the sheet", done: "Prepared changes to the sheet" },
  sheet_actions: { run: "Preparing changes to the sheets", done: "Prepared changes to the sheets" },
  sales_checks: { run: "Checking the sales", done: "Checked the sales" },
  receivables_checks: { run: "Checking the invoices and receipts", done: "Checked the invoices and receipts" },
  payroll_checks: { run: "Checking the payroll", done: "Checked the payroll" },
  grant_checks: { run: "Checking the grant spending", done: "Checked the grant spending" },
  sector_checks: { run: "Running the standard checks", done: "Ran the standard checks" },
  review_points: { run: "Checking the books for errors", done: "Checked the books for errors" },
  sources_sheet: { run: "Listing the files in this job", done: "Listed the files in this job" },
  bank_rec: { run: "Comparing the bank statement to the books", done: "Compared the bank statement to the books" },
  read_document: { run: "Reading the document", done: "Read the document" },
  trace_formula: { run: "Tracing where the figure comes from", done: "Traced where the figure comes from" },
  goal_seek: { run: "Finding the value that reaches the target", done: "Found the value that reaches the target" },
  post_journals: { run: "Preparing the adjusting entries", done: "Prepared the adjusting entries" },
  loan_schedule: { run: "Preparing the loan schedule", done: "Prepared the loan schedule" },
  depreciation_schedule: { run: "Working out depreciation", done: "Worked out depreciation" },
  tb_lines: { run: "Reading the trial balance", done: "Read the trial balance" },
  ar_ap_aging: { run: "Ageing the balances", done: "Aged the balances" },
  wht_schedule: { run: "Preparing the WHT schedule", done: "Prepared the WHT schedule" },
  vat_return: { run: "Preparing the VAT return", done: "Prepared the VAT return" },
  payroll_schedule: { run: "Preparing the payroll", done: "Prepared the payroll" },
  statement_of_affairs: { run: "Preparing the statement of affairs", done: "Prepared the statement of affairs" },
  cac_filing_tracker: { run: "Checking the CAC filings", done: "Checked the CAC filings" },
  annual_report_pack: { run: "Preparing the annual report", done: "Prepared the annual report" },
};

const human = (tool: string) => tool.replace(/_/g, " ");

export function stepWords(tool: string, state: "run" | "done" | "skip"): string {
  const w = W[tool];
  if (!w) return state === "run" ? `Working: ${human(tool)}` : human(tool).replace(/^./, (c) => c.toUpperCase());
  if (state === "skip") return `Skipped: ${w.run.charAt(0).toLowerCase()}${w.run.slice(1)}`;
  return state === "run" ? w.run : w.done;
}

/** Why a step did not fit, in plain words. The raw text stays in the technical details. */
const REASONS: [RegExp, string][] = [
  [/no trial balance/i, "There is no trial balance in this job."],
  [/no (bank )?statement|no bank/i, "There is no bank statement in this job."],
  [/no payroll/i, "There is no payroll register in this job."],
  [/no sheet with a data table|has no table/i, "No table of figures was found for this."],
  [/no sheet|there is no sheet|no workbook/i, "The sheet it needed is not in this job."],
  [/period|date range|do not overlap/i, "The files cover different periods."],
  [/invalid arguments|field required|extra inputs/i, "Sage asked for this in the wrong way and moved on."],
  [/timeout|timed out/i, "This took too long and was stopped."],
  [/nothing to do|no .* matched/i, "There was nothing to change."],
];

export function plainReason(err: string): string {
  for (const [re, text] of REASONS) if (re.test(err)) return text;
  return "This step did not fit the files, so Sage carried on without it.";
}

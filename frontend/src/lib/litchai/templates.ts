/**
 * Templates with a workbook compiler wired today (mirrors the backend's
 * `COMPILABLE_TEMPLATES` in `litchai/api.py`). Split out of `client.ts` — that
 * module is `server-only`, and this constant is also needed by client
 * components (the compile-workbook template picker).
 */
export const COMPILABLE_TEMPLATES = [
  { value: "annual_report_ias1", label: "Annual report — IAS 1" },
  { value: "annual_report_ifrs18", label: "Annual report — IFRS 18" },
] as const;

export type CompilableTemplate = (typeof COMPILABLE_TEMPLATES)[number]["value"];

/**
 * The file types a request document may have (client uploads, staff uploads,
 * and the server relay share this one list). Each content type lists the
 * extensions it may carry. The analysis server makes an xlsx working copy of
 * every non-xlsx sheet-like file; the original is kept and cited.
 */
export const REQUEST_DOC_TYPES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "text/csv": ["csv"],
  "text/tab-separated-values": ["tsv"],
  "text/plain": ["txt", "csv", "tsv"],
  "application/json": ["json"],
  "application/vnd.ms-excel": ["xls", "csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-excel.sheet.macroEnabled.12": ["xlsm"],
  "application/vnd.oasis.opendocument.spreadsheet": ["ods"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
};

export const REQUEST_DOC_FORMATS = "XLSX, XLSM, XLS, ODS, CSV, TSV, TXT, JSON, PDF, DOCX, PNG, JPG";

export const REQUEST_DOC_ACCEPT = ".xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt,.json,.pdf,.docx,.png,.jpg,.jpeg";

/** True when the content type is allowed and the file name's extension matches it. */
export function allowedRequestDoc(fileName: string, contentType: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return Boolean(REQUEST_DOC_TYPES[contentType]?.includes(ext));
}

/** Files the workbench can open: as xlsx directly, or as an xlsx working copy. */
export const WORKBENCH_SHEET_TYPES = /\.(xlsx|xlsm|xls|ods|csv|tsv|txt|json|docx)$/i;

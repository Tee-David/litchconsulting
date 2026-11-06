"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Download, Loader2, Upload } from "lucide-react";
import { Button, Sheet } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { importClientsAction } from "@/app/admin/clients/actions";

type Field = "name" | "company" | "email" | "phone" | "address" | "taxId";
type Row = Record<Field, string>;

/** Header words we accept for each field (lower case, spaces and punctuation removed). */
const SYNONYMS: Record<Field, string[]> = {
  name: ["name", "contact", "contactname", "contactperson", "fullname"],
  company: ["company", "companyname", "business", "organisation", "organization", "client"],
  email: ["email", "emailaddress", "mail"],
  phone: ["phone", "phonenumber", "mobile", "telephone", "tel"],
  address: ["address", "location", "officeaddress"],
  taxId: ["tin", "taxid", "rc", "rcnumber", "tinrc", "taxnumber"],
};
const LABEL: Record<Field, string> = { name: "Contact name", company: "Company", email: "Email", phone: "Phone", address: "Address", taxId: "TIN / RC" };
const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

function mapHeaders(headers: string[]): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const h of headers) {
    const n = norm(h);
    for (const f of Object.keys(SYNONYMS) as Field[]) if (!out[f] && SYNONYMS[f].includes(n)) out[f] = h;
  }
  return out;
}

const TEMPLATE = "Company,Contact name,Email,Phone,Address,TIN / RC\nAdewale Foods Ltd,Adewale Bello,finance@adewalefoods.example,+234 800 000 0000,\"12 Allen Avenue, Ikeja\",TIN 12345678-0001\n";

/** "Import CSV" on Clients: pick a file, check the matched columns and a preview, then import. */
export function ImportClientsButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [mapped, setMapped] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: { line: number; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFileName("");
    setRows([]);
    setMapped({});
    setResult(null);
    setError(null);
  }

  function onFile(f: File) {
    reset();
    setFileName(f.name);
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        const m = mapHeaders(headers);
        if (!m.name && !m.company) {
          setError("No Company or Contact name column was found. Use the template headers.");
          return;
        }
        setMapped(m);
        setRows(
          res.data.map((r) => {
            const o = {} as Row;
            for (const k of Object.keys(LABEL) as Field[]) o[k] = (m[k] ? r[m[k]!] : "")?.toString().trim() ?? "";
            return o;
          }),
        );
      },
      error: () => setError("The file could not be read as CSV."),
    });
  }

  async function run() {
    setBusy(true);
    const r = await importClientsAction(rows);
    setBusy(false);
    if (!r.ok) return setError(r.error || "The import did not finish.");
    setResult({ created: r.created ?? 0, skipped: r.skipped ?? [] });
    toast.success(`${r.created} ${r.created === 1 ? "client" : "clients"} imported.`);
    router.refresh();
  }

  const template = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "litch-clients-template.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button onClick={() => { reset(); setOpen(true); }}>
        <Upload className="size-4" aria-hidden /> Import CSV
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!busy}
        title="Import clients from a CSV"
        description="One row per client. Rows with an email that is already a client are skipped."
        size="lg"
        footer={
          result ? (
            <Button variant="primary" onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={run} disabled={busy || rows.length === 0}>
                {busy && <Loader2 className="size-4 animate-spin" />} Import {rows.length || ""} {rows.length === 1 ? "client" : "clients"}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-3 text-sm">
            <p className="text-ink"><b>{result.created}</b> imported. <b>{result.skipped.length}</b> skipped.</p>
            {result.skipped.length > 0 && (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-ctl border border-hairline p-3 text-[13px] text-body">
                {result.skipped.map((s) => <li key={s.line}>Line {s.line}: {s.reason}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-ctl border border-dashed border-line-strong px-4 text-sm text-body hover:bg-surface">
                <Upload className="size-4 text-muted" aria-hidden /> {fileName || "Choose a CSV file"}
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </label>
              <Button variant="ghost" size="sm" onClick={template}>
                <Download className="size-4" aria-hidden /> Template
              </Button>
            </div>
            {error && <p role="alert" className="rounded-ctl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
            {rows.length > 0 && (
              <>
                <p className="text-[13px] text-body">
                  Matched columns:{" "}
                  {(Object.keys(LABEL) as Field[]).map((f) => (
                    <span key={f} className={mapped[f] ? "text-ink" : "text-muted line-through"}>{LABEL[f]}{f !== "taxId" ? " · " : ""}</span>
                  ))}
                </p>
                <div className="overflow-x-auto rounded-ctl border border-hairline">
                  <table className="w-full min-w-[560px] text-left text-[13px]">
                    <thead className="bg-surface text-xs text-muted">
                      <tr>{(["company", "name", "email", "phone"] as Field[]).map((f) => <th key={f} className="px-3 py-2 font-medium">{LABEL[f]}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {rows.slice(0, 5).map((r, i) => (
                        <tr key={i}>{(["company", "name", "email", "phone"] as Field[]).map((f) => <td key={f} className="truncate px-3 py-2 text-ink">{r[f] || "—"}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[12px] text-muted">{rows.length > 5 ? `Showing 5 of ${rows.length} rows.` : `${rows.length} rows.`}</p>
              </>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown, FileText, Sheet, FileType } from "lucide-react";

export type ExportColumn<T> = { header: string; accessor: (row: T) => string | number };

function download(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV (hand-rolled), XLSX (xlsx), PDF (jspdf + autotable) export dropdown. */
export function ExportMenu<T>({
  rows,
  columns,
  filename = "export",
  title,
}: {
  rows: T[];
  columns: ExportColumn<T>[];
  filename?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const headers = columns.map((c) => c.header);
  const matrix = () => rows.map((r) => columns.map((c) => c.accessor(r)));

  function toCSV() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(esc).join(","), ...matrix().map((row) => row.map(esc).join(","))];
    download(lines.join("\n"), `${filename}.csv`, "text/csv;charset=utf-8");
    setOpen(false);
  }

  async function toXLSX() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([headers, ...matrix()]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${filename}.xlsx`);
    setOpen(false);
  }

  async function toPDF() {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: headers.length > 6 ? "landscape" : "portrait" });
    if (title) doc.text(title, 14, 16);
    autoTable(doc, {
      head: [headers],
      body: matrix().map((r) => r.map((c) => String(c ?? ""))),
      startY: title ? 22 : 14,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [10, 25, 109] },
    });
    doc.save(`${filename}.pdf`);
    setOpen(false);
  }

  const items = [
    { label: "CSV", icon: FileText, onClick: toCSV },
    { label: "Excel (XLSX)", icon: Sheet, onClick: toXLSX },
    { label: "PDF", icon: FileType, onClick: toPDF },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={rows.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:opacity-50"
      >
        <Download className="size-4" />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-hairline bg-paper p-1.5 shadow-xl shadow-black/10">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={it.onClick}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
            >
              <it.icon className="size-4 text-muted" />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

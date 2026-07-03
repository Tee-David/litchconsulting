"use client";

import { ExportMenu } from "@/components/admin/ui/export-menu";
import type { InvoiceRow } from "@/lib/db/queries/invoices";
import { num } from "@/lib/invoice/money";

export function ReportsExport({ invoices }: { invoices: InvoiceRow[] }) {
  const columns = [
    { header: "Invoice", accessor: (r: InvoiceRow) => r.number },
    { header: "Client", accessor: (r: InvoiceRow) => r.billToCompany || r.billToName || "" },
    { header: "Project", accessor: (r: InvoiceRow) => r.projectTitle || "" },
    { header: "Amount", accessor: (r: InvoiceRow) => num(r.total) },
    { header: "Currency", accessor: (r: InvoiceRow) => r.currency },
    { header: "Issued", accessor: (r: InvoiceRow) => r.issueDate },
    { header: "Due", accessor: (r: InvoiceRow) => r.dueDate || "" },
    { header: "Status", accessor: (r: InvoiceRow) => r.status },
  ];
  return <ExportMenu rows={invoices} columns={columns} filename="invoice-report" title="Invoice report" />;
}

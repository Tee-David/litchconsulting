"use client";

import { ExportMenu } from "@/components/admin/ui/export-menu";

export type BillingExportRow = {
  number: string;
  kind: string;
  status: string;
  issueDate: string;
  dueDate: string;
  total: string;
  amountPaid: string;
  currency: string;
  projectTitle: string;
};

/** Client-side wrapper so ExportMenu's function accessors never cross the RSC boundary. */
export function BillingExport({ rows, filename }: { rows: BillingExportRow[]; filename: string }) {
  return (
    <ExportMenu
      rows={rows}
      filename={filename}
      title="Billing history"
      columns={[
        { header: "Number", accessor: (r) => r.number },
        { header: "Kind", accessor: (r) => r.kind },
        { header: "Status", accessor: (r) => r.status },
        { header: "Issued", accessor: (r) => r.issueDate },
        { header: "Due", accessor: (r) => r.dueDate },
        { header: "Project", accessor: (r) => r.projectTitle },
        { header: "Total", accessor: (r) => r.total },
        { header: "Paid", accessor: (r) => r.amountPaid },
        { header: "Currency", accessor: (r) => r.currency },
      ]}
    />
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileOutput, Loader2, Table2 } from "lucide-react";
import { Button, Sheet } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { openDocumentInWorkbenchAction } from "@/lib/workbench/actions";
import { WorkbookCompiler } from "./workbook-compiler";

/** Header actions on an Analysis result: open it in the workbench, or make a deliverable. */
export function AnalysisActions({ documentId, clientId, engagementId, ready }: { documentId: number; clientId: string; engagementId: number | null; ready: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [deliver, setDeliver] = useState(false);

  const open = async () => {
    setBusy(true);
    const r = await openDocumentInWorkbenchAction(documentId);
    if (!r.ok) {
      setBusy(false);
      toast.error(r.error);
      return;
    }
    router.push(`/admin/analyses/w/${r.id}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => setDeliver(true)} disabled={!ready}>
        <FileOutput className="size-4" aria-hidden /> Make a deliverable
      </Button>
      <Button variant="primary" onClick={open} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Table2 className="size-4" aria-hidden />} Open in workbench
      </Button>
      <Sheet
        open={deliver}
        onClose={() => setDeliver(false)}
        title="Make a deliverable"
        description="Build a formula-driven Excel file from the checked figures. The review checks show after it is built."
        size="lg"
      >
        <WorkbookCompiler documentId={documentId} clientId={clientId} engagementId={engagementId} />
      </Sheet>
    </div>
  );
}

"use client";

import { type ReactNode, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * Client shell around the vendored Extend xlsx editor (heavy — loaded lazily,
 * never server-rendered). Theme follows the admin's `.dark` class on <html>
 * both ways: the page theme drives the grid, and the editor's own night
 * toggle is kept in sync.
 */
const XlsxEditorPreview = dynamic(
  () => import("@/components/ui/shadcn/xlsx-editor").then((m) => m.XlsxEditorPreview),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[70vh] place-items-center rounded-card border border-hairline bg-paper">
        <span className="inline-flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Loading spreadsheet editor…
        </span>
      </div>
    ),
  }
);

export function WorkbookEditor({
  src,
  fileName,
  aiPanel,
}: {
  src: string;
  fileName?: string;
  aiPanel?: ReactNode;
}) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-paper">
      <XlsxEditorPreview
        src={src}
        fileName={fileName}
        isDark={isDark}
        onIsDarkChange={setIsDark}
        className="min-h-[70vh]"
        aiPanel={aiPanel}
      />
    </div>
  );
}

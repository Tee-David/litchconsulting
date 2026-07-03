"use client";

import { SlidersHorizontal } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";

export function CustomizeButton() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast.toast("Drag-to-rearrange & resize is coming to the dashboard soon.")}
      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
    >
      <SlidersHorizontal className="size-4" /> Customize
    </button>
  );
}

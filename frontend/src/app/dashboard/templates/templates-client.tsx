"use client";

import { useState, useMemo } from "react";
import { 
  Search, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  FileCode, 
  FileArchive, 
  File 
} from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { motion, AnimatePresence } from "framer-motion";
import type { TemplateRow } from "@/lib/db/queries/templates";

type TemplatesClientProps = {
  templates: TemplateRow[];
};

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const CATEGORIES = ["All", "Financial Modeling", "Tax", "Legal", "General"];

export function TemplatesClient({ templates }: TemplatesClientProps) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesCategory =
        activeCategory === "All" ||
        t.category.toLowerCase() === activeCategory.toLowerCase();

      const matchesSearch =
        (t.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description || "").toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [templates, activeCategory, searchQuery]);

  const getFileIcon = (fileType: string) => {
    const type = fileType.toUpperCase();
    if (type === "XLSX" || type === "CSV" || type === "XLS") {
      return <FileSpreadsheet className="size-8 text-emerald-600 dark:text-emerald-400" />;
    }
    if (type === "PDF") {
      return <FileText className="size-8 text-red-600 dark:text-red-400" />;
    }
    if (type === "DOCX" || type === "DOC" || type === "TXT") {
      return <FileCode className="size-8 text-blue-600 dark:text-blue-400" />;
    }
    if (type === "ZIP" || type === "RAR") {
      return <FileArchive className="size-8 text-purple-600 dark:text-purple-400" />;
    }
    return <File className="size-8 text-muted" />;
  };

  const getFileTypeStyle = (fileType: string) => {
    const type = fileType.toUpperCase();
    if (type === "XLSX" || type === "CSV") {
      return "border-emerald-500/20 bg-emerald-500/[0.04]";
    }
    if (type === "PDF") {
      return "border-red-500/20 bg-red-500/[0.04]";
    }
    if (type === "DOCX" || type === "DOC") {
      return "border-blue-500/20 bg-blue-500/[0.04]";
    }
    if (type === "ZIP") {
      return "border-purple-500/20 bg-purple-500/[0.04]";
    }
    return "border-hairline bg-surface";
  };

  return (
    <div className="space-y-6">
      {/* Category Tabs & Search Panel */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Category filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-brand text-white dark:bg-highlight dark:text-ink"
                  : "border border-hairline text-body hover:bg-surface hover:text-ink"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search templates & guides..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-hairline bg-paper pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
          />
        </div>
      </div>

      {/* Grid of Templates */}
      <AnimatePresence mode="popLayout">
        {filteredTemplates.length === 0 ? (
          <div className="rounded-card border border-hairline bg-paper p-12">
            <EmptyState
              icon={File}
              title="No templates found"
              description={
                searchQuery
                  ? "Try adjusting your search query to find relevant documents."
                  : `There are currently no templates in the ${activeCategory} category.`
              }
            />
          </div>
        ) : (
          <motion.div 
            layout
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {filteredTemplates.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className={`flex flex-col justify-between rounded-card border p-5 transition-shadow hover:shadow-lg hover:shadow-black/5 bg-paper ${getFileTypeStyle(t.fileType)}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    {getFileIcon(t.fileType)}
                    <div className="flex items-center gap-1.5">
                      {t.badge && (
                        <Badge tone={t.badge === "Popular" ? "brand" : "success"}>
                          {t.badge}
                        </Badge>
                      )}
                      <Badge tone="neutral" className="text-[10px]">
                        {t.fileType}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h4 className="font-display text-base font-bold text-ink leading-snug">
                      {t.title}
                    </h4>
                    <p className="mt-1.5 text-xs text-body leading-relaxed line-clamp-3">
                      {t.description || "No description provided. Click download to fetch the starter sheet."}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-hairline pt-4">
                  <span className="text-xs text-muted font-medium">
                    {t.category} · {formatBytes(t.sizeBytes)}
                  </span>
                  <a
                    href={t.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                  >
                    <Download className="size-4" />
                    Download
                  </a>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

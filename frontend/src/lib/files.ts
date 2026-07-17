import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  Presentation,
  File as FileIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared file helpers — human sizes + type icons. Single source of truth so the
 * uploader, templates, document lists and settings all render files the same
 * way (this replaces four divergent `formatBytes` copies that capped at MB).
 * Server-safe: no "use client", lucide icons render fine in RSCs.
 */

/** Human-readable size, Bytes → TB (never caps at MB). */
export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v >= 100 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}

type FileKind = "sheet" | "doc" | "pdf" | "image" | "slides" | "archive" | "other";

const EXT_KIND: Record<string, FileKind> = {
  xlsx: "sheet", xls: "sheet", csv: "sheet",
  docx: "doc", doc: "doc",
  pdf: "pdf",
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", svg: "image",
  pptx: "slides", ppt: "slides",
  zip: "archive",
};

const MIME_KIND: Record<string, FileKind> = {
  "application/pdf": "pdf",
  "text/csv": "sheet",
  "application/vnd.ms-excel": "sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "sheet",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
  "application/vnd.ms-powerpoint": "slides",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "slides",
  "application/zip": "archive",
};

const KIND_META: Record<FileKind, { Icon: LucideIcon; color: string; label: string }> = {
  sheet: { Icon: FileSpreadsheet, color: "#16a34a", label: "Sheet" },
  doc: { Icon: FileText, color: "#2540c4", label: "Doc" },
  pdf: { Icon: FileText, color: "#e5484d", label: "PDF" },
  image: { Icon: FileImage, color: "#a855f7", label: "Image" },
  slides: { Icon: Presentation, color: "#f97316", label: "Slides" },
  archive: { Icon: FileArchive, color: "#8a92a6", label: "Archive" },
  other: { Icon: FileIcon, color: "#8a92a6", label: "File" },
};

const EXT_LABEL: Record<string, string> = {
  xlsx: "XLSX", xls: "XLSX", csv: "CSV", docx: "DOCX", doc: "DOCX",
  pdf: "PDF", pptx: "PPTX", ppt: "PPTX", zip: "ZIP",
  png: "PNG", jpg: "JPG", jpeg: "JPG", webp: "WEBP", gif: "GIF", svg: "SVG",
};

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

/** Short uppercase type badge from a filename, e.g. "report.xlsx" → "XLSX". */
export function extLabel(name: string): string {
  return EXT_LABEL[extOf(name)] || "FILE";
}

/** Icon + brand-ish colour + label for a filename or MIME type. */
export function fileTypeMeta(nameOrMime: string): { Icon: LucideIcon; color: string; label: string } {
  const byMime = MIME_KIND[nameOrMime];
  const kind: FileKind = byMime ?? EXT_KIND[extOf(nameOrMime)] ?? "other";
  return KIND_META[kind];
}

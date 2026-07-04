"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, FileText, ChevronRight, Filter } from "lucide-react";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";
import { formatMoney } from "@/lib/invoice/money";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { motion, AnimatePresence } from "framer-motion";
import type { InvoiceRow } from "@/lib/db/queries/invoices";

type InvoicesClientProps = {
  invoices: InvoiceRow[];
};

export function InvoicesClient({ invoices }: InvoicesClientProps) {
  const [activeTab, setActiveTab] = useState<"invoices" | "quotes">("invoices");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Separate invoices and quotes
  const invoicesList = useMemo(() => invoices.filter((i) => i.kind === "invoice"), [invoices]);
  const quotesList = useMemo(() => invoices.filter((i) => i.kind === "quote"), [invoices]);

  // Current active list
  const currentList = activeTab === "invoices" ? invoicesList : quotesList;

  // Unique statuses for the current active list
  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>();
    currentList.forEach((i) => {
      if (i.status) statuses.add(i.status);
    });
    return Array.from(statuses);
  }, [currentList]);

  // Filtered list
  const filteredList = useMemo(() => {
    return currentList.filter((item) => {
      const matchesSearch =
        (item.number || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.projectTitle || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus =
        selectedStatus === "all" || item.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [currentList, searchQuery, selectedStatus]);

  // Reset status filter when active tab changes
  const handleTabChange = (tab: "invoices" | "quotes") => {
    setActiveTab(tab);
    setSelectedStatus("all");
  };

  return (
    <div className="space-y-6">
      {/* Header and Tab Switcher */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => handleTabChange("invoices")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "invoices"
              ? "bg-brand text-white dark:bg-highlight dark:text-ink"
              : "border border-hairline text-body hover:bg-surface hover:text-ink"
          }`}
        >
          Invoices ({invoicesList.length})
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("quotes")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "quotes"
              ? "bg-brand text-white dark:bg-highlight dark:text-ink"
              : "border border-hairline text-body hover:bg-surface hover:text-ink"
          }`}
        >
          Quotes ({quotesList.length})
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder={`Search ${activeTab} by number or project title...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-hairline bg-paper pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Filter className="size-4 text-muted shrink-0" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 rounded-lg border border-hairline bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-brand"
          >
            <option value="all">All statuses</option>
            {availableStatuses.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Document Table/List */}
      <div className="rounded-card border border-hairline bg-paper overflow-hidden">
        {filteredList.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={FileText}
              title={`No ${activeTab} found`}
              description={
                searchQuery || selectedStatus !== "all"
                  ? "Try resetting your search query or status filter."
                  : `Your ${activeTab} will appear here once issued by the firm.`
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="px-5 py-3">Number</th>
                  <th className="px-5 py-3">Project Title</th>
                  <th className="px-5 py-3">Date Issued</th>
                  {activeTab === "invoices" ? (
                    <th className="px-5 py-3">Due Date</th>
                  ) : (
                    <th className="px-5 py-3">Expiry Date</th>
                  )}
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                <AnimatePresence mode="popLayout">
                  {filteredList.map((item) => (
                    <motion.tr
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="group hover:bg-surface/50"
                    >
                      <td className="px-5 py-4 font-semibold text-ink">
                        <Link href={`/dashboard/invoices/${item.id}`} className="hover:text-brand">
                          {item.number}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-ink font-medium max-w-[200px] truncate">
                        {item.projectTitle || "Consulting Services"}
                      </td>
                      <td className="px-5 py-4 text-body whitespace-nowrap">{item.issueDate}</td>
                      <td className="px-5 py-4 text-body whitespace-nowrap">
                        {item.dueDate || "Upon Receipt"}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold tabular-nums text-ink">
                        {formatMoney(Number(item.total), item.currency)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={invoiceStatusTone(item.status)}>{item.status}</Badge>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Link
                          href={`/dashboard/invoices/${item.id}`}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-brand"
                        >
                          <ChevronRight className="size-4.5" />
                        </Link>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

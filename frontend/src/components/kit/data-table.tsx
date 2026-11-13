"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Row,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

/* ──────────────────────────────────────────────────────────────────────────
 * DataTable (kit) — the one table for every list in the three dashboards.
 *
 * Client mode (default): `data` is the full list; search, filters, views,
 * sorting and pagination run in the browser. Server mode: pass `server`
 * ({ total }) and `data` is ONE page — every change is written to the URL
 * (?q=&page=&size=&sort=&view=&f_<id>=) and the RSC page re-queries.
 *
 * Column meta (ColumnDef.meta):
 *   label    — name in the column chooser / mobile card (defaults to header)
 *   align    — "left" | "right" | "center"
 *   mobile   — "title" | "subtitle" | "meta" | "badge" | "hidden" (card layout)
 *   hideable — false to keep a column always visible
 *   defaultHidden — true to start hidden (user can show it)
 *   width    — CSS width for the header cell
 * ────────────────────────────────────────────────────────────────────────── */

export type ColumnMeta = {
  label?: string;
  align?: "left" | "right" | "center";
  mobile?: "title" | "subtitle" | "meta" | "badge" | "hidden";
  hideable?: boolean;
  defaultHidden?: boolean;
  width?: string;
};

export type TableView<T> = {
  id: string;
  label: string;
  /** Client mode: which rows belong to the view. Server mode: ignored (use count). */
  predicate?: (row: T) => boolean;
  /** Server mode: the count to show on the tab. */
  count?: number;
};

export type TableFilter<T> = {
  id: string;
  label: string;
  options: Array<{ value: string; label: string; count?: number }>;
  /** Client mode: how a row matches a chosen value. */
  match?: (row: T, value: string) => boolean;
};

export type BulkAction<T> = {
  id: string;
  label: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  /** Return a promise; the bar shows a spinner and clears selection on success. */
  run: (rows: T[]) => Promise<unknown> | unknown;
  /** Ask before running (danger actions). The string is the question. */
  confirm?: string | ((rows: T[]) => string);
  /** Hide the action unless every selected row passes. */
  when?: (rows: T[]) => boolean;
};

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId: (row: T) => string;
  /** Stable key for remembering page size and visible columns. */
  storageKey?: string;
  searchPlaceholder?: string;
  /** Client mode: fields to search. Defaults to every string/number value. */
  searchText?: (row: T) => string;
  views?: TableView<T>[];
  filters?: TableFilter<T>[];
  bulkActions?: BulkAction<T>[];
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Custom card for < 640px. Defaults to a card built from column meta. */
  renderCard?: (row: T) => ReactNode;
  toolbarEnd?: ReactNode;
  emptyState?: ReactNode;
  /** Shown when search/filters hide everything. */
  noMatchState?: ReactNode;
  loading?: boolean;
  error?: string | null;
  initialSort?: SortingState;
  pageSizes?: number[];
  defaultPageSize?: number;
  /** Keep q/page/size/sort/view/filters in the URL (always on in server mode). */
  urlState?: boolean;
  server?: { total: number };
  className?: string;
  /** Accessible name for the table. */
  label: string;
};

const DEFAULT_SIZES = [10, 25, 50, 100];

function readStore<V>(key: string | undefined, fallback: V): V {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`litch.table.${key}`);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as V) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string | undefined, value: unknown) {
  if (!key) return;
  try {
    window.localStorage.setItem(`litch.table.${key}`, JSON.stringify(value));
  } catch {
    /* private mode / quota — preferences just won't persist */
  }
}

function metaOf<T>(c: ColumnDef<T, unknown>): ColumnMeta {
  return (c.meta as ColumnMeta | undefined) ?? {};
}
function colId<T>(c: ColumnDef<T, unknown>): string {
  return (c.id ?? (c as { accessorKey?: string }).accessorKey ?? "") as string;
}
function colLabel<T>(c: ColumnDef<T, unknown>): string {
  const m = metaOf(c);
  if (m.label) return m.label;
  return typeof c.header === "string" ? c.header : colId(c);
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  storageKey,
  searchPlaceholder = "Search…",
  searchText,
  views,
  filters,
  bulkActions,
  rowHref,
  onRowClick,
  renderCard,
  toolbarEnd,
  emptyState,
  noMatchState,
  loading,
  error,
  initialSort = [],
  pageSizes = DEFAULT_SIZES,
  defaultPageSize = 25,
  urlState,
  server,
  className,
  label,
}: Props<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const useUrl = Boolean(urlState || server);

  /* ---------------------------------------------------------------- state */
  const prefs = useMemo(
    () =>
      readStore<{ size: number; hidden: string[] }>(storageKey, {
        size: defaultPageSize,
        hidden: columns.filter((c) => metaOf(c).defaultHidden).map(colId),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  );

  const urlNum = (k: string, d: number) => {
    const v = Number(params.get(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };

  const [q, setQ] = useState(() => (useUrl ? params.get("q") ?? "" : ""));
  const [view, setView] = useState(() => (useUrl ? params.get("view") : null) ?? views?.[0]?.id ?? "");
  const [chosen, setChosen] = useState<Record<string, string>>(() => {
    if (!useUrl || !filters) return {};
    const out: Record<string, string> = {};
    for (const f of filters) {
      const v = params.get(`f_${f.id}`);
      if (v) out[f.id] = v;
    }
    return out;
  });
  const [sorting, setSorting] = useState<SortingState>(() => {
    const s = useUrl ? params.get("sort") : null;
    if (!s) return initialSort;
    const desc = s.startsWith("-");
    return [{ id: desc ? s.slice(1) : s, desc }];
  });
  const [pageIndex, setPageIndex] = useState(() => (useUrl ? urlNum("page", 1) - 1 : 0));
  const [pageSize, setPageSize] = useState(() =>
    useUrl && params.get("size") ? urlNum("size", prefs.size) : prefs.size,
  );
  const [visibility, setVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(prefs.hidden.map((id) => [id, false])),
  );
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [allMatching, setAllMatching] = useState(false);

  /* -------------------------------------------------------- URL syncing */
  const pushUrl = useCallback(
    (patch: Record<string, string | null>) => {
      if (!useUrl) return;
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [useUrl, params, pathname, router],
  );

  // Debounce search → URL (server mode refetches on every URL change).
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (v: string) => {
    setQ(v);
    setPageIndex(0);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => pushUrl({ q: v || null, page: null }), 300);
  };

  /* ------------------------------------------------- client-side filtering */
  const filtered = useMemo(() => {
    if (server) return data;
    let rows = data;
    const v = views?.find((x) => x.id === view);
    if (v?.predicate) rows = rows.filter(v.predicate);
    for (const f of filters ?? []) {
      const value = chosen[f.id];
      if (value && f.match) rows = rows.filter((r) => f.match!(r, value));
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      const text =
        searchText ??
        ((r: T) =>
          Object.values(r as Record<string, unknown>)
            .filter((x) => typeof x === "string" || typeof x === "number")
            .join(" "));
      rows = rows.filter((r) => text(r).toLowerCase().includes(needle));
    }
    return rows;
  }, [data, server, views, view, filters, chosen, q, searchText]);

  const viewCounts = useMemo(() => {
    if (!views) return {};
    return Object.fromEntries(
      views.map((v) => [v.id, server ? v.count : v.predicate ? data.filter(v.predicate).length : data.length]),
    ) as Record<string, number | undefined>;
  }, [views, data, server]);

  // Never open on an empty default view (e.g. "Active 0" while "All 3" has rows).
  const autoViewDone = useRef(false);
  useEffect(() => {
    if (autoViewDone.current || !views?.length || server) return;
    autoViewDone.current = true;
    if (useUrl && params.get("view")) return; // the user chose a view
    if (view !== views[0].id || (viewCounts[view] ?? 1) > 0) return;
    const firstWithRows = views.find((v) => (viewCounts[v.id] ?? 0) > 0);
    if (firstWithRows) setView(firstWithRows.id);
    // Run once, after the first counts are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewCounts]);

  /* --------------------------------------------------------------- table */
  const selectCol: ColumnDef<T, unknown> = useMemo(
    () => ({
      id: "__select",
      enableSorting: false,
      meta: { hideable: false, mobile: "hidden", width: "44px" } satisfies ColumnMeta,
      header: ({ table }) => (
        <Checkbox
          label="Select all rows on this page"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={(v) => {
            table.toggleAllPageRowsSelected(v);
            setAllMatching(false);
          }}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          label="Select row"
          checked={row.getIsSelected()}
          onChange={(v) => {
            row.toggleSelected(v);
            setAllMatching(false);
          }}
        />
      ),
    }),
    [],
  );

  const allColumns = useMemo(
    () => (bulkActions?.length ? [selectCol, ...columns] : columns),
    [bulkActions, selectCol, columns],
  );

  const table = useReactTable({
    data: filtered,
    columns: allColumns,
    getRowId: (r) => getRowId(r),
    state: { sorting, columnVisibility: visibility, rowSelection: selection, pagination: { pageIndex, pageSize } },
    onSortingChange: (u) => {
      const next = typeof u === "function" ? u(sorting) : u;
      setSorting(next);
      setPageIndex(0);
      const s = next[0];
      pushUrl({ sort: s ? `${s.desc ? "-" : ""}${s.id}` : null, page: null });
    },
    onColumnVisibilityChange: (u) => {
      const next = typeof u === "function" ? u(visibility) : u;
      setVisibility(next);
      writeStore(storageKey, {
        size: pageSize,
        hidden: Object.entries(next).filter(([, v]) => v === false).map(([k]) => k),
      });
    },
    onRowSelectionChange: setSelection,
    enableRowSelection: Boolean(bulkActions?.length),
    manualPagination: Boolean(server),
    manualSorting: Boolean(server),
    manualFiltering: Boolean(server),
    pageCount: server ? Math.max(1, Math.ceil(server.total / pageSize)) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const total = server ? server.total : filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Keep the page in range when the data shrinks (e.g. after a bulk delete).
  useEffect(() => {
    if (pageIndex > pageCount - 1) setPageIndex(pageCount - 1);
  }, [pageIndex, pageCount]);

  const goPage = (i: number) => {
    const p = Math.min(Math.max(0, i), pageCount - 1);
    setPageIndex(p);
    pushUrl({ page: p === 0 ? null : String(p + 1) });
  };
  const changeSize = (n: number) => {
    setPageSize(n);
    setPageIndex(0);
    writeStore(storageKey, {
      size: n,
      hidden: Object.entries(visibility).filter(([, v]) => v === false).map(([k]) => k),
    });
    pushUrl({ size: n === defaultPageSize ? null : String(n), page: null });
  };

  const selectedRows: T[] = allMatching
    ? filtered
    : table.getSelectedRowModel().flatRows.map((r) => r.original);
  const clearSelection = () => {
    setSelection({});
    setAllMatching(false);
  };

  const pageRows = table.getRowModel().rows;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const hasActiveFilters = Boolean(q.trim()) || Object.values(chosen).some(Boolean);

  const open = (row: T) => {
    if (rowHref) router.push(rowHref(row));
    else onRowClick?.(row);
  };
  const clickable = Boolean(rowHref || onRowClick);

  /* ---------------------------------------------------------------- render */
  return (
    <section aria-label={label} className={cn("flex flex-col gap-3", className)}>
      {/* Views */}
      {views && views.length > 1 ? (
        <div role="tablist" aria-label={`${label} views`} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {views.map((v) => {
            const on = v.id === view;
            const n = viewCounts[v.id];
            return (
              <button
                key={v.id}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => {
                  setView(v.id);
                  setPageIndex(0);
                  clearSelection();
                  pushUrl({ view: v.id === views[0].id ? null : v.id, page: null });
                }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  on
                    ? "border-transparent bg-act text-act-ink"
                    : "border-hairline bg-paper text-body hover:border-line-strong hover:text-ink",
                )}
              >
                {v.label}
                {typeof n === "number" ? (
                  <span className={cn("tabular-nums text-xs", on ? "opacity-80" : "text-muted")}>{n}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search {label}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-ctl border border-line-strong bg-paper pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        {filters?.map((f) => (
          <FilterSelect
            key={f.id}
            filter={f}
            value={chosen[f.id] ?? ""}
            onChange={(v) => {
              setChosen((c) => ({ ...c, [f.id]: v }));
              setPageIndex(0);
              clearSelection();
              pushUrl({ [`f_${f.id}`]: v || null, page: null });
            }}
          />
        ))}
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setChosen({});
              setPageIndex(0);
              const patch: Record<string, null> = { q: null, page: null };
              for (const f of filters ?? []) patch[`f_${f.id}`] = null;
              pushUrl(patch);
            }}
            className="inline-flex h-10 items-center gap-1 rounded-ctl px-2.5 text-sm font-medium text-muted hover:text-ink"
          >
            <X className="size-4" aria-hidden /> Clear
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {toolbarEnd}
          <ColumnChooser columns={columns} visibility={visibility} onToggle={(id, show) => table.getColumn(id)?.toggleVisibility(show)} />
        </div>
      </div>

      {/* Table (≥ sm) */}
      <div className="hidden overflow-hidden rounded-card border border-hairline bg-paper sm:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm" aria-label={label} aria-rowcount={total}>
            <thead className="sticky top-0 z-10">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const m = metaOf(h.column.columnDef as ColumnDef<T, unknown>);
                    const sorted = h.column.getIsSorted();
                    const canSort = h.column.getCanSort();
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        style={m.width ? { width: m.width } : undefined}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                        className={cn(
                          "border-b border-hairline bg-grid-head px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted",
                          m.align === "right" ? "text-right" : m.align === "center" ? "text-center" : "text-left",
                        )}
                      >
                        {h.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={h.column.getToggleSortingHandler()}
                            className={cn(
                              "inline-flex items-center gap-1 uppercase hover:text-ink",
                              m.align === "right" && "flex-row-reverse",
                            )}
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {sorted === "asc" ? (
                              <ArrowUp className="size-3.5" aria-hidden />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="size-3.5" aria-hidden />
                            ) : (
                              <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                            )}
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                  <tr key={`sk${i}`}>
                    {table.getVisibleLeafColumns().map((c) => (
                      <td key={c.id} className="border-b border-hairline px-3 py-3">
                        <span className="skeleton block h-3.5 w-3/4 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length} className="px-6 py-12 text-center text-sm text-bad">
                    {error}
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length} className="px-6 py-12">
                    {hasActiveFilters ? noMatchState ?? <NoMatch /> : emptyState ?? <NoMatch empty />}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <DesktopRow key={row.id} row={row} clickable={clickable} onOpen={open} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards (< sm) */}
      <ul className="flex flex-col gap-2 sm:hidden" aria-label={label}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <li key={`skc${i}`} className="rounded-card border border-hairline bg-paper p-4">
              <span className="skeleton mb-2 block h-4 w-2/3 rounded" />
              <span className="skeleton block h-3 w-1/2 rounded" />
            </li>
          ))
        ) : error ? (
          <li className="rounded-card border border-hairline bg-paper p-6 text-center text-sm text-bad">{error}</li>
        ) : pageRows.length === 0 ? (
          <li className="rounded-card border border-hairline bg-paper p-6">
            {hasActiveFilters ? noMatchState ?? <NoMatch /> : emptyState ?? <NoMatch empty />}
          </li>
        ) : (
          pageRows.map((row) => (
            <MobileCard
              key={row.id}
              row={row}
              columns={columns}
              selectable={Boolean(bulkActions?.length)}
              renderCard={renderCard}
              clickable={clickable}
              onOpen={open}
              onSelect={(v) => {
                row.toggleSelected(v);
                setAllMatching(false);
              }}
            />
          ))
        )}
      </ul>

      {/* Footer: page size + pagination */}
      <div className="flex flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">Rows per page</span>
          <Select
            aria-label="Rows per page"
            value={String(pageSize)}
            onChange={(v) => changeSize(Number(v))}
            options={pageSizes.map((n) => ({ value: String(n), label: String(n) }))}
            className="w-20"
          />
          <span className="whitespace-nowrap tabular-nums" aria-live="polite">
            {from}–{to} of {total.toLocaleString("en-NG")}
          </span>
        </div>
        <nav aria-label={`${label} pages`} className="flex items-center gap-1 self-end sm:self-auto">
          <PageBtn label="First page" disabled={pageIndex === 0} onClick={() => goPage(0)}>
            <ChevronsLeft className="size-4" />
          </PageBtn>
          <PageBtn label="Previous page" disabled={pageIndex === 0} onClick={() => goPage(pageIndex - 1)}>
            <ChevronLeft className="size-4" />
          </PageBtn>
          <span className="px-2 tabular-nums text-ink">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <PageBtn label="Next page" disabled={pageIndex >= pageCount - 1} onClick={() => goPage(pageIndex + 1)}>
            <ChevronRight className="size-4" />
          </PageBtn>
          <PageBtn label="Last page" disabled={pageIndex >= pageCount - 1} onClick={() => goPage(pageCount - 1)}>
            <ChevronsRight className="size-4" />
          </PageBtn>
        </nav>
      </div>

      {/* Bulk bar */}
      {bulkActions?.length && selectedRows.length > 0 ? (
        <BulkBar
          count={selectedRows.length}
          canSelectAll={!server && !allMatching && selectedRows.length < filtered.length}
          totalMatching={filtered.length}
          onSelectAll={() => setAllMatching(true)}
          onClear={clearSelection}
          actions={bulkActions}
          rows={selectedRows}
        />
      ) : null}
    </section>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

function DesktopRow<T>({ row, clickable, onOpen }: { row: Row<T>; clickable: boolean; onOpen: (r: T) => void }) {
  const onKey = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (!clickable) return;
    if (e.key === "Enter") onOpen(row.original);
    if (e.key === " " && row.getCanSelect()) {
      e.preventDefault();
      row.toggleSelected();
    }
  };
  return (
    <tr
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={onKey}
      onClick={(e) => {
        if (!clickable) return;
        // Clicks on controls inside the row (checkbox, menus, links) do their own thing.
        if ((e.target as HTMLElement).closest("button, a, input, select, label, [data-row-stop]")) return;
        onOpen(row.original);
      }}
      data-state={row.getIsSelected() ? "selected" : undefined}
      className={cn(
        "group transition-colors data-[state=selected]:bg-brand-tint",
        clickable && "cursor-pointer outline-none hover:bg-cloud focus-visible:bg-brand-tint",
      )}
    >
      {row.getVisibleCells().map((cell) => {
        const m = metaOf(cell.column.columnDef as ColumnDef<T, unknown>);
        return (
          <td
            key={cell.id}
            className={cn(
              "border-b border-hairline px-3 py-3 align-middle text-body group-last:border-b-0",
              m.align === "right" ? "text-right tabular-nums" : m.align === "center" ? "text-center" : "text-left",
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}

function MobileCard<T>({
  row,
  columns,
  selectable,
  renderCard,
  clickable,
  onOpen,
  onSelect,
}: {
  row: Row<T>;
  columns: ColumnDef<T, unknown>[];
  selectable: boolean;
  renderCard?: (row: T) => ReactNode;
  clickable: boolean;
  onOpen: (r: T) => void;
  onSelect: (v: boolean) => void;
}) {
  const cells = row.getVisibleCells().filter((c) => c.column.id !== "__select");
  const byRole = (role: ColumnMeta["mobile"]) =>
    cells.filter((c) => (metaOf(c.column.columnDef as ColumnDef<T, unknown>).mobile ?? "meta") === role);
  const titleCells = byRole("title");
  const title = titleCells.length ? titleCells : cells.slice(0, 1);
  const rest = cells.filter((c) => !title.includes(c));
  const subtitle = rest.filter((c) => metaOf(c.column.columnDef as ColumnDef<T, unknown>).mobile === "subtitle");
  const badges = rest.filter((c) => metaOf(c.column.columnDef as ColumnDef<T, unknown>).mobile === "badge");
  const metas = rest.filter((c) => {
    const role = metaOf(c.column.columnDef as ColumnDef<T, unknown>).mobile ?? "meta";
    return role === "meta";
  });
  void columns;

  return (
    <li
      data-state={row.getIsSelected() ? "selected" : undefined}
      className="relative rounded-card border border-hairline bg-paper p-4 data-[state=selected]:border-accent data-[state=selected]:bg-brand-tint"
    >
      <div className="flex items-start gap-3">
        {selectable ? (
          <div className="pt-0.5">
            <Checkbox label="Select row" checked={row.getIsSelected()} onChange={onSelect} />
          </div>
        ) : null}
        {/* A div, not a <button>: cells may hold links, buttons or pickers, and an
            interactive element inside a <button> is invalid HTML (the browser then
            moves parts of the list out of the page). */}
        <div
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={(e) => {
            if (!clickable) return;
            // A click on a control inside the card is that control's, not the row's.
            const hit = (e.target as HTMLElement).closest("a,button,input,select,textarea,[role=listbox],[role=option]");
            if (hit && hit !== e.currentTarget) return;
            onOpen(row.original);
          }}
          onKeyDown={(e) => {
            if (clickable && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onOpen(row.original);
            }
          }}
          className={cn("min-w-0 flex-1 rounded-ctl text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40", clickable && "cursor-pointer")}
        >
          {renderCard ? (
            renderCard(row.original)
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-medium text-ink">
                  {title.map((c) => (
                    <div key={c.id} className="truncate">
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </div>
                  ))}
                </div>
                {badges.length ? (
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {badges.map((c) => (
                      <span key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              {subtitle.map((c) => (
                <div key={c.id} className="mt-0.5 truncate text-sm text-body">
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </div>
              ))}
              {metas.length ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {metas.map((c) => (
                    <div key={c.id} className="min-w-0">
                      <dt className="text-muted">{colLabel(c.column.columnDef as ColumnDef<T, unknown>)}</dt>
                      <dd className="truncate text-body">{flexRender(c.column.columnDef.cell, c.getContext())}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate && !checked);
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="size-4 cursor-pointer rounded border-line-strong accent-[var(--color-act)]"
    />
  );
}

function FilterSelect<T>({ filter, value, onChange }: { filter: TableFilter<T>; value: string; onChange: (v: string) => void }) {
  // Quick-filter chip: "+ Service" until a value is chosen, then "Service: X ×".
  // A designed menu (never a browser select), searchable when it has over 5 options.
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);
  const chosen = filter.options.find((o) => o.value === value);
  const options = find.trim()
    ? filter.options.filter((o) => o.label.toLowerCase().includes(find.trim().toLowerCase()))
    : filter.options;
  return (
    <div className="relative" ref={ref}>
      {chosen ? (
        <span className="inline-flex h-10 items-center rounded-full border border-accent bg-brand-tint text-sm text-ink">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="h-full rounded-l-full pl-3.5 pr-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <span className="text-body">{filter.label}:</span> <span className="font-medium">{chosen.label}</span>
          </button>
          <button
            type="button"
            aria-label={`Clear ${filter.label} filter`}
            onClick={() => onChange("")}
            className="grid h-full place-items-center rounded-r-full pl-1 pr-2.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ) : (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-10 items-center gap-1 rounded-full border border-dashed border-line-strong bg-paper px-3.5 text-sm font-medium text-body outline-none hover:border-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span aria-hidden>+</span> {filter.label}
        </button>
      )}
      {open ? (
        <div className="absolute left-0 z-30 mt-1.5 w-60 rounded-ctl border border-hairline bg-paper p-1.5 shadow-lg">
          {filter.options.length > 5 ? (
            <input
              type="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder={`Find ${filter.label.toLowerCase()}`}
              aria-label={`Find ${filter.label.toLowerCase()}`}
              autoFocus
              className="mb-1 h-9 w-full rounded-lg border border-line-strong bg-paper px-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
            />
          ) : null}
          <ul role="listbox" aria-label={filter.label} className="max-h-64 overflow-y-auto">
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value === value ? "" : o.value);
                    setOpen(false);
                    setFind("");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-surface"
                >
                  <span className={cn("grid size-4 place-items-center rounded-full border", o.value === value ? "border-act bg-act text-act-ink" : "border-line-strong")}>
                    {o.value === value ? <Check className="size-3" aria-hidden /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {typeof o.count === "number" ? <span className="tabular-nums text-xs text-muted">{o.count}</span> : null}
                </button>
              </li>
            ))}
            {!options.length ? <li className="px-2 py-2 text-sm text-muted">No match</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ColumnChooser<T>({
  columns,
  visibility,
  onToggle,
}: {
  columns: ColumnDef<T, unknown>[];
  visibility: VisibilityState;
  onToggle: (id: string, show: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);
  const hideable = columns.filter((c) => metaOf(c).hideable !== false && colId(c));
  if (!hideable.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-1.5 rounded-ctl border border-line-strong bg-paper px-3 text-sm font-medium text-ink hover:bg-surface"
      >
        <Columns3 className="size-4" aria-hidden />
        <span className="hidden md:inline">Columns</span>
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 w-56 rounded-ctl border border-hairline bg-paper p-1.5 shadow-lg">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Show columns</p>
          {hideable.map((c) => {
            const id = colId(c);
            const on = visibility[id] !== false;
            return (
              <button
                key={id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onToggle(id, !on)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-surface"
              >
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded border",
                    on ? "border-act bg-act text-act-ink" : "border-line-strong",
                  )}
                >
                  {on ? <Check className="size-3" aria-hidden /> : null}
                </span>
                {colLabel(c)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PageBtn({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-ctl border border-line-strong bg-paper text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function NoMatch({ empty }: { empty?: boolean }) {
  return (
    <div className="mx-auto max-w-sm text-center">
      <p className="font-medium text-ink">{empty ? "Nothing here yet" : "No rows match"}</p>
      <p className="mt-1 text-sm text-muted">
        {empty ? "New items will appear here as soon as they exist." : "Try a different search or clear the filters."}
      </p>
    </div>
  );
}

function BulkBar<T>({
  count,
  canSelectAll,
  totalMatching,
  onSelectAll,
  onClear,
  actions,
  rows,
}: {
  count: number;
  canSelectAll: boolean;
  totalMatching: number;
  onSelectAll: () => void;
  onClear: () => void;
  actions: BulkAction<T>[];
  rows: T[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<BulkAction<T> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const visible = actions.filter((a) => !a.when || a.when(rows));

  const run = async (a: BulkAction<T>) => {
    setBusy(a.id);
    setErr(null);
    try {
      await a.run(rows);
      onClear();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not work. Try again.");
    } finally {
      setBusy(null);
      setAsking(null);
    }
  };

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper px-4 py-3 shadow-[0_-8px_24px_rgb(10_14_26/0.08)] sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:max-w-[min(56rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:rounded-card sm:border sm:shadow-xl"
    >
      {asking ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-ink">
            {typeof asking.confirm === "function" ? asking.confirm(rows) : asking.confirm}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAsking(null)}
              className="h-9 rounded-ctl border border-line-strong px-3 text-sm font-medium text-ink hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run(asking)}
              className={cn(
                "h-9 rounded-ctl px-3 text-sm font-semibold text-white disabled:opacity-60",
                asking.tone === "danger" ? "bg-bad" : "bg-act",
              )}
            >
              {busy ? "Working…" : `Yes, ${asking.label.toLowerCase()}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-1 text-sm font-semibold text-ink" aria-live="polite">
            {count.toLocaleString("en-NG")} selected
          </p>
          {canSelectAll ? (
            <button type="button" onClick={onSelectAll} className="text-sm font-medium text-accent hover:underline">
              Select all {totalMatching.toLocaleString("en-NG")}
            </button>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {visible.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={busy !== null}
                onClick={() => (a.confirm ? setAsking(a) : run(a))}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-ctl border px-3 text-sm font-medium transition-colors disabled:opacity-60",
                  a.tone === "danger"
                    ? "border-bad/30 text-bad hover:bg-bad-soft"
                    : "border-line-strong text-ink hover:bg-surface",
                )}
              >
                {a.icon}
                {busy === a.id ? "Working…" : a.label}
              </button>
            ))}
            <button
              type="button"
              aria-label="Clear selection"
              onClick={onClear}
              className="grid size-9 place-items-center rounded-ctl text-muted hover:bg-surface hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
          {err ? <p className="w-full text-sm text-bad">{err}</p> : null}
        </div>
      )}
    </div>
  );
}

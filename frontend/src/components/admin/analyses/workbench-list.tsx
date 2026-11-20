"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ellipsis, FileSpreadsheet, Loader2, MessageSquareText, Search, Table2, X } from "lucide-react";
import { Button, ConfirmSheet, Segmented, Sheet } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { deleteWorkbenchAction, renameWorkbenchAction, searchWorkbenchesAction } from "@/lib/workbench/actions";
import type { WbSearchHit } from "@/lib/litchai/workbench";
import { cn } from "@/lib/utils";

export type WorkbenchRow = {
  id: string;
  title: string;
  kind: "request" | "firm" | "practice";
  files: number | null;
  request: string | null;
  client: string | null;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
};

type Filter = "all" | "request" | "firm" | "practice";
type Sort = "used" | "name" | "new";
const FIRST = 5;
const STEP = 10;

const KIND_WORD: Record<WorkbenchRow["kind"], string> = { request: "Request", firm: "Firm", practice: "Practice" };
const WHERE_WORD: Record<WbSearchHit["where"], string> = { name: "Name", file: "File", chat: "Chat" };

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}

/**
 * The workbench list on Analyses (v7): search names, files and chats; filter; sort;
 * the 5 most recent first, then Show more; each row opens, renames or moves to Trash.
 */
export function WorkbenchList({ rows, canSearch }: { rows: WorkbenchRow[]; canSearch: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("used");
  const [shown, setShown] = useState(FIRST);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<WbSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<WorkbenchRow | null>(null);
  const [name, setName] = useState("");
  const [trashing, setTrashing] = useState<WorkbenchRow | null>(null);
  const seq = useRef(0);

  const counts = useMemo(() => {
    const c = { all: rows.length, request: 0, firm: 0, practice: 0 };
    for (const r of rows) c[r.kind] += 1;
    return c;
  }, [rows]);

  const list = useMemo(() => {
    const out = rows.filter((r) => filter === "all" || r.kind === filter);
    out.sort((a, b) =>
      sort === "name" ? a.title.localeCompare(b.title) : sort === "new" ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt),
    );
    return out;
  }, [rows, filter, sort]);

  // Search: names match at once here; files and chats come from the analysis server.
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) {
      setHits(null);
      setSearchErr(null);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      if (!canSearch) return;
      setSearching(true);
      const res = await searchWorkbenchesAction(term);
      if (mine !== seq.current) return;
      setSearching(false);
      if (res.ok) {
        setHits(res.hits);
        setSearchErr(null);
      } else setSearchErr(res.error);
    }, 300);
    return () => clearTimeout(t);
  }, [term, canSearch]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const results = useMemo(() => {
    if (term.length < 2) return null;
    const low = term.toLowerCase();
    const local = rows.filter((r) => [r.title, r.client ?? "", r.request ?? ""].some((x) => x.toLowerCase().includes(low)));
    const seen = new Set<string>();
    const out: { row: WorkbenchRow; hit?: WbSearchHit }[] = [];
    for (const h of hits ?? []) {
      const row = byId.get(h.id);
      if (row && !seen.has(row.id)) {
        seen.add(row.id);
        out.push({ row, hit: h });
      }
    }
    for (const row of local) if (!seen.has(row.id)) out.push({ row });
    return out;
  }, [term, rows, hits, byId]);

  async function rename() {
    if (!renaming) return;
    const res = await renameWorkbenchAction(renaming.id, name);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.message ?? "Renamed.");
    setRenaming(null);
    router.refresh();
  }

  const visible = list.slice(0, shown);

  return (
    <section aria-label="Workbenches" className="rounded-card border border-hairline bg-paper">
      <div className="flex flex-col gap-3 border-b border-hairline p-4 sm:p-5">
        <label htmlFor="wb-search" className="text-[13px] font-medium text-ink">
          Search names, files and chats
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="wb-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="For example: Ebube, GTBank statement, PAYE"
            autoComplete="off"
            className="min-h-11 w-full rounded-ctl border border-hairline bg-surface pl-9 pr-10 text-sm text-ink placeholder:text-muted outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear the search"
              className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-ctl text-muted hover:bg-cloud hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        {results === null ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              label="Show"
              size="sm"
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setShown(FIRST);
              }}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "request", label: "Requests", count: counts.request },
                { value: "firm", label: "Firm", count: counts.firm },
                { value: "practice", label: "Practice", count: counts.practice },
              ]}
            />
            <Segmented
              label="Sort by"
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: "used", label: "Last used" },
                { value: "name", label: "Name" },
                { value: "new", label: "Newest" },
              ]}
            />
          </div>
        ) : null}
      </div>

      {results !== null ? (
        <div aria-live="polite">
          <p className="flex min-h-10 items-center gap-2 px-4 pt-3 text-[13px] text-muted sm:px-5">
            {searching ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {searching
              ? "Searching files and chats…"
              : searchErr
                ? `${searchErr} Names are still searched here.`
                : !canSearch
                  ? "Names only: files and chats can be searched when the analysis server answers."
                  : `${results.length} workbench${results.length === 1 ? "" : "es"} found`}
          </p>
          {results.length ? (
            <ul className="divide-y divide-hairline">
              {results.map(({ row, hit }) => (
                <Row key={row.id} row={row} hit={hit} onRename={() => (setName(row.title), setRenaming(row))} onTrash={() => setTrashing(row)} />
              ))}
            </ul>
          ) : !searching ? (
            <p className="px-4 pb-6 pt-2 text-sm text-body sm:px-5">
              Nothing matches <b className="font-semibold text-ink">{term}</b>. Try a client name, a file name or a word from the chat.
            </p>
          ) : null}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-8 text-center sm:px-5">
          <p className="text-sm font-semibold text-ink">No workbenches yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-body">
            Select <b>New analysis</b> and add a file or a ZIP, or open one from a request (Work on the files, then Open in workbench).
          </p>
        </div>
      ) : list.length === 0 ? (
        <p className="px-4 py-6 text-sm text-body sm:px-5">
          No {KIND_WORD[filter as WorkbenchRow["kind"]]?.toLowerCase()} workbenches.{" "}
          <button type="button" onClick={() => setFilter("all")} className="font-medium text-accent hover:underline dark:text-info">
            Show all
          </button>
        </p>
      ) : (
        <>
          <ul className="divide-y divide-hairline">
            {visible.map((row) => (
              <Row key={row.id} row={row} onRename={() => (setName(row.title), setRenaming(row))} onTrash={() => setTrashing(row)} />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-3 sm:px-5">
            <p className="text-[13px] tabular-nums text-muted">
              Showing {visible.length} of {list.length}
            </p>
            {list.length > visible.length ? (
              <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + STEP)}>
                Show {Math.min(STEP, list.length - visible.length)} more
              </Button>
            ) : list.length > FIRST ? (
              <Button variant="ghost" size="sm" onClick={() => setShown(FIRST)}>
                Show fewer
              </Button>
            ) : null}
          </div>
        </>
      )}

      <Sheet
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename workbench"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={rename} disabled={!name.trim() || name.trim() === renaming?.title}>
              Save name
            </Button>
          </div>
        }
      >
        <label htmlFor="wb-name" className="text-[13px] font-medium text-ink">
          Name
        </label>
        <input
          id="wb-name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) void rename();
          }}
          className="mt-1.5 min-h-11 w-full rounded-ctl border border-hairline bg-surface px-3 text-sm text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        />
      </Sheet>

      <ConfirmSheet
        open={trashing !== null}
        onClose={() => setTrashing(null)}
        tone="danger"
        title="Move this workbench to Trash?"
        confirmLabel="Move to Trash"
        body={
          <div className="space-y-2 text-sm text-body">
            <p>
              <b className="font-semibold text-ink">{trashing?.title}</b> leaves this list. You can restore it from Trash for 30 days.
            </p>
            <p>After 30 days, the workbench, its chats and its uploaded files are deleted for good. Files that a request uses are kept.</p>
          </div>
        }
        onConfirm={async () => {
          if (!trashing) return;
          const res = await deleteWorkbenchAction(trashing.id);
          if (!res.ok) throw new Error(res.error);
          toast.success(res.message ?? "Moved to Trash.");
          setTrashing(null);
          router.refresh();
        }}
      />
    </section>
  );
}

function Row({ row, hit, onRename, onTrash }: { row: WorkbenchRow; hit?: WbSearchHit; onRename: () => void; onTrash: () => void }) {
  const meta = [
    row.files === null ? null : `${row.files} file${row.files === 1 ? "" : "s"}`,
    row.request,
    row.client,
    row.kind === "practice" ? "Practice" : row.kind === "firm" && !row.client ? "Firm" : null,
  ].filter(Boolean);
  const HitIcon = hit?.where === "chat" ? MessageSquareText : hit?.where === "file" ? FileSpreadsheet : null;
  return (
    <li className="group relative flex items-center gap-3 px-4 py-3 hover:bg-surface sm:px-5">
      <Table2 className="size-4 shrink-0 text-good" aria-hidden />
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/analyses/w/${row.id}`}
          className="block truncate text-sm font-medium text-ink outline-none after:absolute after:inset-0 focus-visible:underline"
        >
          {row.title}
        </Link>
        {meta.length ? <p className="mt-0.5 truncate text-[12.5px] text-muted">{meta.join(" · ")}</p> : null}
        {hit && hit.where !== "name" ? (
          <p className="mt-1 flex min-w-0 items-start gap-1.5 text-[12.5px] text-body">
            {HitIcon ? <HitIcon className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden /> : null}
            <span className="min-w-0">
              <span className="font-medium text-ink">{WHERE_WORD[hit.where]}:</span> <span className="line-clamp-2">{hit.snippet}</span>
            </span>
          </p>
        ) : null}
      </div>
      <span className="hidden shrink-0 text-[12.5px] tabular-nums text-muted sm:block" title={new Date(row.updatedAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}>
        {ago(row.updatedAt)}
      </span>
      <RowMenu title={row.title} href={`/admin/analyses/w/${row.id}`} onRename={onRename} onTrash={onTrash} />
    </li>
  );
}

/** A small menu: Open, Rename, Move to Trash. Closes on Escape and outside click. */
function RowMenu({ title, href, onRename, onTrash }: { title: string; href: string; onRename: () => void; onTrash: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const item = "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm text-ink hover:bg-surface focus-visible:bg-surface focus-visible:outline-none";
  return (
    <div ref={ref} className="relative z-10 shrink-0">
      <button
        type="button"
        aria-label={`More for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 place-items-center rounded-ctl text-muted hover:bg-cloud hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Ellipsis className="size-4" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-48 rounded-card border border-hairline bg-paper p-1 shadow-lg">
          <Link role="menuitem" href={href} className={item}>
            Open
          </Link>
          <button role="menuitem" type="button" className={item} onClick={() => (setOpen(false), onRename())}>
            Rename
          </button>
          <button role="menuitem" type="button" className={cn(item, "text-bad")} onClick={() => (setOpen(false), onTrash())}>
            Move to Trash
          </button>
        </div>
      ) : null}
    </div>
  );
}

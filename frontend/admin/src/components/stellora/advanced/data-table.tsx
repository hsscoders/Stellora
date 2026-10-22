"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight,
  Copy, Download, Printer, Search, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/* ============================================================
   AdvancedTable — consistent, sortable, searchable, paginated
   table with CSV/JSON export, print, row selection and bulk
   actions. Used by every admin list page.
   ============================================================ */

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** Render the cell for row `row`. */
  cell: (row: T) => ReactNode;
  /** Value used for sorting (return number or string). */
  sortValue?: (row: T) => string | number;
  /** Keys matched by the global search box. */
  searchValue?: (row: T) => string;
  className?: string;
  headerClassName?: string;
  hideBelow?: "sm" | "md" | "lg" | "xl";
  align?: "left" | "right" | "center";
};

export type BulkAction<T> = {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  run: (rows: T[]) => void | Promise<void>;
};

const HIDE_CLASS: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdvancedTable<T>({
  columns,
  rows,
  getKey,
  searchable = true,
  searchPlaceholder = "Search…",
  initialSort,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  selectable = false,
  bulkActions = [],
  toolbar,
  emptyMessage = "Nothing here yet.",
  loadingMessage = "Loading…",
  loading = false,
  csvName,
  printTitle,
  onRowClick,
  rowClassName,
  dense: denseProp,
  footer,
}: {
  columns: Column<T>[];
  rows: T[] | null;
  getKey: (row: T) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
  pageSizeOptions?: number[];
  selectable?: boolean;
  bulkActions?: BulkAction<T>[];
  toolbar?: (ctx: { count: number; filtered: T[] }) => ReactNode;
  emptyMessage?: ReactNode;
  loadingMessage?: ReactNode;
  loading?: boolean;
  csvName?: string;
  printTitle?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  dense?: boolean;
  footer?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSort?.dir ?? "asc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const [dense, setDense] = useState(denseProp ?? false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Reset to first page when the query changes
  function searchAndReset(v: string) {
    setQ(v);
    setPage(1);
  }

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    let out = rows;
    if (needle) {
      out = out.filter((r) =>
        columns.some((c) => {
          const v = c.searchValue?.(r) ?? (typeof c.sortValue?.(r) === "string" ? String(c.sortValue!(r)) : "");
          return v.toLowerCase().includes(needle);
        })
      );
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          const cmp =
            typeof va === "number" && typeof vb === "number"
              ? va - vb
              : String(va).localeCompare(String(vb), undefined, { numeric: true });
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, q, columns, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * size, safePage * size);
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(getKey(r)));

  function toggleSort(key: string) {
    const col = columns.find((c) => c.key === key);
    if (!col?.sortValue) return;
    setPage(1);
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleAll() {
    const next = new Set(selected);
    if (allPageSelected) pageRows.forEach((r) => next.delete(getKey(r)));
    else pageRows.forEach((r) => next.add(getKey(r)));
    setSelected(next);
  }

  async function runBulk(action: BulkAction<T>) {
    const picked = (rows ?? []).filter((r) => selected.has(getKey(r)));
    if (!picked.length) return;
    setBulkBusy(true);
    try {
      await action.run(picked);
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  function exportCsv() {
    if (!csvName) return;
    const headers = columns.map((c) => (typeof c.header === "string" ? c.header : c.key));
    const lines = [headers.map(csvEscape).join(",")];
    for (const r of filtered) {
      lines.push(columns.map((c) => csvEscape(c.sortValue?.(r) ?? "")).join(","));
    }
    download(`${csvName}-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
  }

  function exportJson() {
    if (!csvName) return;
    const data = filtered.map((r) => {
      const o: Record<string, unknown> = {};
      for (const c of columns) o[c.key] = c.sortValue?.(r) ?? null;
      return o;
    });
    download(`${csvName}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
  }

  function copyRows() {
    const headers = columns.map((c) => (typeof c.header === "string" ? c.header : c.key)).join("\t");
    const body = filtered
      .map((r) => columns.map((c) => String(c.sortValue?.(r) ?? "")).join("\t"))
      .join("\n");
    void navigator.clipboard?.writeText(`${headers}\n${body}`).catch(() => undefined);
  }

  function printTable() {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank", "width=1000,height=700");
    if (!w) return;
    w.document.write(
      `<html><head><title>${printTitle ?? "Export"}</title><style>
        body{font-family:ui-sans-serif,system-ui,sans-serif;padding:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px} .sub{font-size:12px;color:#666;margin-bottom:16px}
        table{border-collapse:collapse;width:100%;font-size:11px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f5f5f5;text-transform:uppercase;font-size:9.5px;letter-spacing:.04em}
        img{max-height:40px}
      </style></head><body><h1>${printTitle ?? "Export"}</h1>
      <div class="sub">Stellora Admin · ${new Date().toLocaleString("en-IN")} · ${filtered.length} rows</div>
      ${el.innerHTML}</body></html>`
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  const hideCls = (c: Column<T>) => (c.hideBelow ? HIDE_CLASS[c.hideBelow] : "");
  const alignCls = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {searchable && (
          <div className="relative min-w-44 flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => searchAndReset(e.target.value)} placeholder={searchPlaceholder} className="h-9 pl-9 pr-8" aria-label="Search table" />
            {q && (
              <button onClick={() => searchAndReset("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        {toolbar?.({ count: filtered.length, filtered })}
        <div className="ml-auto flex items-center gap-1.5">
          {(csvName || printTitle) && (
            <div className="flex items-center overflow-hidden rounded-full border border-border text-xs">
              {csvName && (
                <button onClick={exportCsv} className="inline-flex h-8 items-center gap-1.5 px-3 transition hover:bg-accent" title="Download CSV">
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
              )}
              {csvName && (
                <button onClick={exportJson} className="inline-flex h-8 items-center border-x border-border px-3 transition hover:bg-accent" title="Download JSON">
                  JSON
                </button>
              )}
              {csvName && (
                <button onClick={copyRows} className="inline-flex h-8 items-center border-border px-2.5 transition hover:bg-accent" title="Copy to clipboard">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
              {printTitle && (
                <button onClick={printTable} className="inline-flex h-8 items-center border-l border-border px-3 transition hover:bg-accent" title="Print">
                  <Printer className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <button
            onClick={() => setDense((d) => !d)}
            className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title="Toggle row density"
          >
            {dense ? "Comfort" : "Compact"}
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectable && selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <span className="font-medium tnum">{selected.size} selected</span>
          <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground" title="Clear selection">
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="mx-1 h-4 w-px bg-border" />
          {bulkActions.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant={a.danger ? "destructive" : "outline"}
              disabled={bulkBusy}
              onClick={() => void runBulk(a)}
              className="h-7 rounded-full px-3 text-xs"
            >
              {a.icon}
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-muted/40 text-left">
                {selectable && (
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Select all on page" />
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "select-none whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                      alignCls(c.align),
                      c.headerClassName,
                      hideCls(c),
                      c.sortValue && "cursor-pointer hover:text-foreground"
                    )}
                    onClick={() => toggleSort(c.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.header}
                      {c.sortValue &&
                        (sortKey === c.key ? (
                          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading || rows === null ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-14 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
                      {loadingMessage}
                    </span>
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-14 text-center text-sm text-muted-foreground">
                    {q ? (
                      <>
                        No results for <span className="font-medium text-foreground">“{q}”</span>
                      </>
                    ) : (
                      emptyMessage
                    )}
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const id = getKey(r);
                  return (
                    <tr
                      key={id}
                      className={cn(
                        "border-b border-border/50 transition last:border-0 hover:bg-accent/40",
                        selected.has(id) && "bg-primary/5",
                        onRowClick && "cursor-pointer",
                        rowClassName?.(r)
                      )}
                      onClick={onRowClick ? () => onRowClick(r) : undefined}
                    >
                      {selectable && (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(id)}
                            onCheckedChange={(v) => {
                              const next = new Set(selected);
                              if (v) next.add(id);
                              else next.delete(id);
                              setSelected(next);
                            }}
                            aria-label="Select row"
                          />
                        </td>
                      )}
                      {columns.map((c) => (
                        <td key={c.key} className={cn(dense ? "px-3 py-1.5" : "px-3 py-2.5", alignCls(c.align), c.className, hideCls(c))}>
                          {c.cell(r)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden print source */}
      <div className="hidden" ref={printRef}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{typeof c.header === "string" ? c.header : c.key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={getKey(r)}>
                {columns.map((c) => (
                  <td key={c.key}>{String(c.sortValue?.(r) ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer / pagination */}
      {rows !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="tnum">
              {filtered.length === 0 ? "0" : `${(safePage - 1) * size + 1}–${Math.min(safePage * size, filtered.length)}`} of {filtered.length}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3 w-3 opacity-40" />
              <select
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded border border-border bg-card px-1.5 py-0.5 text-xs"
                aria-label="Rows per page"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border transition hover:bg-accent disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="tnum px-1.5">
              {safePage} / {pages}
            </span>
            <button
              disabled={safePage >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border transition hover:bg-accent disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      {footer}
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Pencil, Archive, Search, Download, X, Loader2,
  CheckCircle2, FileEdit, ArchiveRestore, ChevronDown, Upload,
} from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatINR } from "@/lib/utils";

interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  status: string;
  category: { name: string };
  images: { url: string }[];
  variants: { id: string; price: string; stock: number; lowStockThreshold: number; isActive: boolean }[];
}

type StatusFilter = "ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED" | "OUT_OF_STOCK";
type SortKey = "newest" | "oldest" | "name" | "priceasc" | "pricedesc" | "stockasc" | "stockdesc";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "DRAFT", label: "Draft" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "OUT_OF_STOCK", label: "Out of stock" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "name", label: "Name A–Z" },
  { key: "priceasc", label: "Price: low → high" },
  { key: "pricedesc", label: "Price: high → low" },
  { key: "stockasc", label: "Stock: low → high" },
  { key: "stockdesc", label: "Stock: high → low" },
];

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number; updated: number; failed: number; errors: { line: number; error: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "ALL") params.set("status", status);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    params.set("sort", sort);
    return fetch(`/api/admin/products?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        setProducts(j.ok ? j.data : []);
        setSelected(new Set());
      });
  }, [q, status, sort, categoryFilter]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, status, sort, categoryFilter, load]);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((j) => setCategories(j.ok ? j.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) : []))
      .catch(() => {});
  }, []);

  const allIds = useMemo(() => products?.map((p) => p.id) ?? [], [products]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(action: "activate" | "draft" | "archive") {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(action);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success(`${json.data.modified} product(s) → ${json.data.action}`);
        await load();
      } else {
        toast.error(json.error?.message ?? "Bulk action failed");
      }
    } catch {
      toast.error("Network error — bulk action failed");
    } finally {
      setBulkBusy(null);
    }
  }

  async function archiveOrDelete(id: string) {
    const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      toast.success(json.data.archived ? json.data.message : "Product deleted");
      load();
    } else {
      toast.error(json.error?.message ?? "Action failed");
    }
  }

  async function importCsv(file: File) {
    if (importBusy) return;
    setImportBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/products/import", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setImportResult(json.data);
        if (json.data.failed === 0) {
          toast.success(`Import done — ${json.data.created} created, ${json.data.updated} updated`);
        }
        await load();
      } else {
        toast.error(json.error?.message ?? "Import failed");
      }
    } catch {
      toast.error("Network error — import failed");
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const stockTone = (p: AdminProduct) => {
    const stock = p.variants.reduce((n, v) => n + (v.isActive ? v.stock : 0), 0);
    const threshold = Math.max(...p.variants.filter((v) => v.isActive).map((v) => v.lowStockThreshold), 0);
    if (stock === 0) return "text-destructive font-medium";
    if (threshold > 0 && stock <= threshold) return "text-amber-600 dark:text-amber-400 font-medium";
    return "";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-medium">Products</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importCsv(f);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={importBusy}
            onClick={() => fileRef.current?.click()}
          >
            {importBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import CSV
          </Button>
          <a href="/api/admin/export/products" className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm transition hover:border-primary hover:text-primary">
            <Download className="h-4 w-4" /> Export CSV
          </a>
          <Button asChild className="rounded-full bg-primary hover:bg-primary/90">
            <Link href="/admin/products/new">
              <Plus className="h-4 w-4" /> New product
            </Link>
          </Button>
        </div>
      </div>

      {importResult && (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium">
              Import finished — <span className="text-emerald-600">{importResult.created} created</span>,{" "}
              <span className="text-primary">{importResult.updated} updated</span>
              {importResult.failed > 0 && (
                <>　<span className="text-destructive">{importResult.failed} skipped</span></>
              )}
            </div>
            <button
              className="text-muted-foreground transition hover:text-foreground"
              onClick={() => setImportResult(null)}
              aria-label="Dismiss import result"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
              {importResult.errors.map((e, i) => (
                <li key={i}>• {e.line ? `Row ${e.line}: ` : ""}{e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Filters row: search · category · sort · status chips */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="pl-9" />
        </div>

        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="h-9 appearance-none rounded-full border border-border bg-card pl-3 pr-8 text-sm transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort products"
            className="h-9 appearance-none rounded-full border border-border bg-card pl-3 pr-8 text-sm transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                status === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {products === null ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* Bulk action bar — appears when rows are selected */}
          {selected.size > 0 && (
            <div className="anim-fade-up sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-full border border-primary/30 bg-accent/90 px-4 py-2 shadow-sm backdrop-blur">
              <span className="text-sm font-medium tnum">{selected.size} selected</span>
              <span className="h-4 w-px bg-border" />
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full" disabled={!!bulkBusy} onClick={() => runBulk("activate")}>
                {bulkBusy === "activate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} Activate
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full" disabled={!!bulkBusy} onClick={() => runBulk("draft")}>
                {bulkBusy === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileEdit className="h-3.5 w-3.5 text-amber-600" />} Set draft
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full" disabled={!!bulkBusy} onClick={() => runBulk("archive")}>
                {bulkBusy === "archive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5 text-rose-600" />} Archive
              </Button>
              <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 rounded-full" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all products"
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Price from</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const stock = p.variants.reduce((n, v) => n + (v.isActive ? v.stock : 0), 0);
                  const activePrice = p.variants.filter((v) => v.isActive)[0]?.price;
                  const isSelected = selected.has(p.id);
                  return (
                    <TableRow key={p.id} data-state={isSelected ? "selected" : undefined} className={isSelected ? "bg-accent/50" : undefined}>
                      <TableCell>
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(p.id)} aria-label={`Select ${p.name}`} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border">
                            <Image
                              src={p.images[0]?.url ?? "/images/placeholder.svg"}
                              alt=""
                              fill
                              sizes="44px"
                              className="object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-52 truncate font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">/{p.slug}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{p.category.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            p.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : p.status === "DRAFT"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                          }
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className={`tnum text-sm ${stockTone(p)}`}>
                        {stock}
                        {stock === 0 && <span className="ml-1">(out)</span>}
                      </TableCell>
                      <TableCell className="text-right tnum text-sm">
                        {activePrice ? formatINR(activePrice) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" aria-label="Edit">
                            <Link href={`/admin/products/${p.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Delete or archive">
                                <Archive className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete “{p.name}”?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Products with order history are archived instead of deleted, to
                                  preserve accurate records. This cannot be undone for products
                                  without orders.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                  onClick={() => archiveOrDelete(p.id)}
                                >
                                  Continue
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No products found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground tnum">
            {products.length} product{products.length === 1 ? "" : "s"} shown
            {selected.size > 0 ? ` · ${selected.size} selected` : ""}
          </p>
        </>
      )}
    </div>
  );
}

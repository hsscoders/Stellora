"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Download,
  History,
  PackageX,
  PackageSearch,
  Sparkles,
  Wallet,
} from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow, EmptyState } from "@/components/stellora/advanced/widgets";
import { formatDateTime, formatINR } from "@/lib/utils";

interface VariantRow {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  lowStockThreshold: number;
  category: string | null;
  product: { name: string; slug: string };
}

interface Movement {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  reference: string | null;
  createdAt: string;
}

type StockChip = "ALL" | "LOW" | "OUT";
const STOCK_CHIPS = ["ALL", "LOW", "OUT"] as const;
const UNCATEGORISED = "Uncategorised";

function stockStatus(r: VariantRow): "OUT" | "LOW" | "OK" {
  if (r.stock === 0) return "OUT";
  if (r.stock <= r.lowStockThreshold) return "LOW";
  return "OK";
}

/**
 * Auto-suggested restock quantity: bring the variant to 4× its low-stock
 * threshold (at least 10 units) so a busy stretch never zero it out again.
 */
function suggestedRestock(r: VariantRow): number {
  const target = Math.max(r.lowStockThreshold * 4, 10);
  return Math.max(0, target - r.stock);
}

/** CSV field quoting: wrap in double quotes, escape inner quotes by doubling. */
function csvField(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export default function AdminInventoryPage() {
  const [rows, setRows] = useState<VariantRow[] | null>(null);
  const [chip, setChip] = useState<StockChip>("ALL");
  const [catFilter, setCatFilter] = useState<string>("ALL");
  const [adjusting, setAdjusting] = useState<VariantRow | null>(null);
  const [deltaVal, setDeltaVal] = useState("");
  const [historyOf, setHistoryOf] = useState<VariantRow | null>(null);
  const [movements, setMovements] = useState<Movement[] | null>(null);

  const load = () =>
    fetch("/api/admin/products")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          const flat: VariantRow[] = [];
          for (const p of j.data) {
            for (const v of p.variants) {
              flat.push({
                id: v.id,
                sku: v.sku,
                name: v.name,
                price: Number(v.price ?? 0),
                stock: v.stock,
                lowStockThreshold: v.lowStockThreshold,
                category: p.category?.name ?? null,
                product: { name: p.name, slug: p.slug },
              });
            }
          }
          setRows(flat);
        }
      });

  useEffect(() => {
    load();
  }, []);

  /** Open the adjust dialog, pre-filling the auto-suggested restock delta. */
  function openAdjust(v: VariantRow) {
    const suggestion = suggestedRestock(v);
    setDeltaVal(suggestion > 0 ? String(suggestion) : "");
    setAdjusting(v);
  }

  async function openHistory(v: VariantRow) {
    setHistoryOf(v);
    setMovements(null);
    try {
      const res = await fetch(`/api/admin/inventory/${v.id}/movements`, { cache: "no-store" });
      const json = await res.json();
      setMovements(json.ok ? json.data : []);
    } catch {
      setMovements([]);
      toast.error("Could not load movement history");
    }
  }

  async function adjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!adjusting) return;
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/admin/inventory/${adjusting.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        delta: Number(form.get("delta")),
        note: form.get("note"),
      }),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(`Stock updated: ${json.data.stock} on hand`);
      setAdjusting(null);
      load();
    } else {
      toast.error(json.error?.message ?? "Could not adjust stock");
    }
  }

  function exportCsv() {
    const data = filtered;
    if (data.length === 0) {
      toast.error("Nothing to export — adjust the filters first");
      return;
    }
    const header = "product,variant,sku,stock,threshold,status";
    const lines = data.map((r) =>
      [
        r.product.name,
        r.name,
        r.sku,
        r.stock,
        r.lowStockThreshold,
        stockStatus(r) === "OUT" ? "Out of stock" : stockStatus(r) === "LOW" ? "Low" : "In stock",
      ]
        .map(csvField)
        .join(",")
    );
    const csv = [header, ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
      d.getDate()
    ).padStart(2, "0")}`;
    a.href = url;
    a.download = `stellora-inventory-${ymd}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} row${data.length === 1 ? "" : "s"} to CSV`);
  }

  const list = useMemo(() => rows ?? [], [rows]);

  const filtered = useMemo(
    () =>
      list.filter((r) => {
        const status = stockStatus(r);
        if (chip === "LOW" && status !== "LOW") return false;
        if (chip === "OUT" && status !== "OUT") return false;
        if (catFilter === UNCATEGORISED) {
          if (r.category !== null) return false;
        } else if (catFilter !== "ALL" && r.category !== catFilter) {
          return false;
        }
        return true;
      }),
    [list, chip, catFilter]
  );

  const lowCount = useMemo(() => list.filter((r) => stockStatus(r) === "LOW").length, [list]);
  const outCount = useMemo(() => list.filter((r) => stockStatus(r) === "OUT").length, [list]);
  const valuation = useMemo(() => list.reduce((n, r) => n + r.price * r.stock, 0), [list]);

  const categoryOptions = useMemo(() => {
    const names = Array.from(
      new Set(list.map((r) => r.category).filter((n): n is string => !!n))
    ).sort((a, b) => a.localeCompare(b));
    const opts = ["ALL", ...names];
    if (list.some((r) => !r.category)) opts.push(UNCATEGORISED);
    return opts;
  }, [list]);

  const categoryCounts = useMemo<Partial<Record<string, number>>>(() => {
    const counts: Record<string, number> = { ALL: list.length };
    let uncategorised = 0;
    for (const r of list) {
      if (r.category) counts[r.category] = (counts[r.category] ?? 0) + 1;
      else uncategorised += 1;
    }
    if (uncategorised > 0) counts[UNCATEGORISED] = uncategorised;
    return counts;
  }, [list]);

  const stockCounts = useMemo<Partial<Record<StockChip, number>>>(
    () => ({ ALL: list.length, LOW: lowCount, OUT: outCount }),
    [list, lowCount, outCount]
  );

  const columns: Column<VariantRow>[] = useMemo(
    () => [
      {
        key: "product",
        header: "Product",
        sortValue: (v) => v.product.name,
        searchValue: (v) => `${v.product.name} ${v.name} ${v.sku} ${v.category ?? ""}`,
        cell: (v) => (
          <span className="min-w-0">
            <span className="block max-w-52 truncate font-medium">{v.product.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{v.category ?? "Uncategorised"}</span>
          </span>
        ),
      },
      {
        key: "variant",
        header: "Variant",
        sortValue: (v) => v.name,
        searchValue: (v) => v.name,
        hideBelow: "md",
        cell: (v) => <span className="text-sm">{v.name}</span>,
      },
      {
        key: "sku",
        header: "SKU",
        sortValue: (v) => v.sku,
        searchValue: (v) => v.sku,
        hideBelow: "sm",
        cell: (v) => <span className="text-xs text-muted-foreground">{v.sku}</span>,
      },
      {
        key: "price",
        header: "Price",
        align: "right",
        sortValue: (v) => v.price,
        hideBelow: "lg",
        cell: (v) => <span className="tnum text-sm">{formatINR(v.price)}</span>,
      },
      {
        key: "stock",
        header: "Stock",
        align: "right",
        sortValue: (v) => v.stock,
        cell: (v) => {
          const status = stockStatus(v);
          const suggestion = suggestedRestock(v);
          return (
            <span className="block">
              <span className={`tnum text-sm font-semibold ${v.stock === 0 ? "text-destructive" : status === "LOW" ? "text-amber-600" : ""}`}>
                {v.stock}
              </span>
              {status === "OUT" && (
                <Badge variant="secondary" className="ml-2 bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                  Out
                </Badge>
              )}
              {status === "LOW" && (
                <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  Low
                </Badge>
              )}
              {status !== "OK" && suggestion > 0 && (
                <button
                  type="button"
                  onClick={() => openAdjust(v)}
                  className="mt-0.5 block text-[11px] font-medium text-primary hover:underline"
                >
                  Restock +{suggestion} (suggested)
                </button>
              )}
            </span>
          );
        },
      },
      {
        key: "actions",
        header: <span className="sr-only">Actions</span>,
        align: "right",
        cell: (v) => (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => openAdjust(v)}>
              Adjust
            </Button>
            <Button variant="ghost" size="sm" aria-label="Movement history" onClick={() => openHistory(v)}>
              <History className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Boxes}
        title="Inventory"
        subtitle="Stock on hand per variant. Every adjustment is recorded in stock movement history."
        actions={
          <Button variant="outline" onClick={exportCsv} className="rounded-full">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Variants tracked" value={list.length} icon={Boxes} />
        <StatCard label="Low stock" value={lowCount} icon={AlertTriangle} accent="text-amber-600" />
        <StatCard label="Out of stock" value={outCount} icon={PackageX} accent="text-rose-500" />
        <StatCard label="Stock valuation" value={formatINR(valuation)} icon={Wallet} />
      </div>

      {(lowCount > 0 || outCount > 0) && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold tnum">{lowCount}</span> variant
            {lowCount === 1 ? "" : "s"} low on stock
            {outCount > 0 && (
              <>
                {" · "}
                <span className="font-semibold tnum">{outCount}</span> out of stock
              </>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock</span>
          <ChipRow label="Stock level" value={chip} options={STOCK_CHIPS} onChange={setChip} counts={stockCounts} size="sm" />
        </div>
        {categoryOptions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</span>
            <ChipRow
              label="Product category"
              value={catFilter}
              options={categoryOptions}
              onChange={setCatFilter}
              counts={categoryCounts}
              size="sm"
            />
          </div>
        )}
      </div>

      <AdvancedTable
        columns={columns}
        rows={rows}
        getKey={(v) => v.id}
        searchable
        searchPlaceholder="Search SKU, product or category…"
        initialSort={{ key: "product", dir: "asc" }}
        csvName="inventory"
        printTitle="Inventory"
        loading={rows === null}
        emptyMessage={
          <EmptyState
            icon={PackageSearch}
            title={list.length === 0 ? "No variants found" : "Nothing matches the current filters"}
            hint="Add products with variants in the Products page, then manage their stock here."
          />
        }
      />

      {/* Adjust dialog */}
      <Dialog open={!!adjusting} onOpenChange={(v) => !v && setAdjusting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Adjust stock — {adjusting?.product.name} ({adjusting?.name})
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={adjust} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current stock: <span className="font-semibold tnum text-foreground">{adjusting?.stock}</span>
            </p>
            {adjusting && suggestedRestock(adjusting) > 0 && (
              <p className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                Suggested: <span className="font-semibold tnum">+{suggestedRestock(adjusting)}</span>
                <button
                  type="button"
                  onClick={() => setDeltaVal(String(suggestedRestock(adjusting)))}
                  className="ml-auto font-semibold text-primary hover:underline"
                >
                  Use suggestion
                </button>
              </p>
            )}
            <div>
              <Label htmlFor="delta">Change (+ to add, − to remove)</Label>
              <Input
                id="delta"
                name="delta"
                type="number"
                value={deltaVal}
                onChange={(e) => setDeltaVal(e.target.value)}
                placeholder="e.g. 10 or -3"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" name="note" rows={2} placeholder="Restock from supplier #12" />
            </div>
            <Button type="submit" className="w-full rounded-full bg-primary hover:bg-primary/90">
              Apply adjustment
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyOf} onOpenChange={(v) => !v && setHistoryOf(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Stock movements — {historyOf?.product.name} ({historyOf?.name})
            </DialogTitle>
          </DialogHeader>
          {movements === null ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : movements.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No movements recorded.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {movements.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span
                        className={`tnum font-semibold ${
                          m.delta > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : m.delta < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : ""
                        }`}
                      >
                        {m.delta > 0 ? "+" : ""}
                        {m.delta}
                      </span>
                      <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide">
                        {m.reason}
                      </Badge>
                    </p>
                    {m.note && <p className="mt-0.5 text-xs text-muted-foreground">{m.note}</p>}
                    {m.reference && (
                      <p className="text-xs text-muted-foreground">Ref: {m.reference}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

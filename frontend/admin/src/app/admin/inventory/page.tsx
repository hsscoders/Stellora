"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Download,
  History,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

interface VariantRow {
  id: string;
  sku: string;
  name: string;
  stock: number;
  lowStockThreshold: number;
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
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<StockChip>("ALL");
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
                stock: v.stock,
                lowStockThreshold: v.lowStockThreshold,
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
    const data = filtered ?? [];
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

  const filtered = rows?.filter((r) => {
    const status = stockStatus(r);
    if (chip === "LOW" && status !== "LOW") return false;
    if (chip === "OUT" && status !== "OUT") return false;
    return (
      !q ||
      r.sku.toLowerCase().includes(q.toLowerCase()) ||
      r.product.name.toLowerCase().includes(q.toLowerCase())
    );
  });

  const lowCount = rows?.filter((r) => stockStatus(r) === "LOW").length ?? 0;
  const outCount = rows?.filter((r) => stockStatus(r) === "OUT").length ?? 0;

  if (!rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-medium">Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stock on hand per variant. Every adjustment is recorded in stock movement history.
        </p>
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU or product…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["ALL", "All"],
              ["LOW", `Low stock (${lowCount})`],
              ["OUT", `Out of stock (${outCount})`],
            ] as [StockChip, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={chip === value}
              onClick={() => setChip(value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                chip === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={exportCsv} className="ml-auto rounded-full">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Variant</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered?.map((v) => {
              const low = stockStatus(v) !== "OK";
              return (
                <TableRow key={v.id}>
                  <TableCell className="max-w-52 truncate text-sm font-medium">{v.product.name}</TableCell>
                  <TableCell className="text-sm">{v.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{v.sku}</TableCell>
                  <TableCell>
                    <span className={`tnum text-sm font-semibold ${v.stock === 0 ? "text-destructive" : low ? "text-amber-600" : ""}`}>
                      {v.stock}
                    </span>
                    {low && (
                      <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Low
                      </Badge>
                    )}
                    {low && suggestedRestock(v) > 0 && (
                      <button
                        type="button"
                        onClick={() => openAdjust(v)}
                        className="mt-0.5 block text-[11px] font-medium text-primary hover:underline"
                      >
                        Restock +{suggestedRestock(v)} (suggested)
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openAdjust(v)}>
                        Adjust
                      </Button>
                      <Button variant="ghost" size="sm" aria-label="Movement history" onClick={() => openHistory(v)}>
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nothing matches.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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

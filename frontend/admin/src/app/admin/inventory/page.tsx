"use client";

import { useEffect, useState } from "react";
import { Search, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

export default function AdminInventoryPage() {
  const [rows, setRows] = useState<VariantRow[] | null>(null);
  const [q, setQ] = useState("");
  const [adjusting, setAdjusting] = useState<VariantRow | null>(null);
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

  async function openHistory(v: VariantRow) {
    setHistoryOf(v);
    setMovements(null);
    // Movements come through the products payload; simplest is a dedicated fetch on variant via products list
    const res = await fetch("/api/admin/products");
    const json = await res.json();
    if (json.ok) {
      const variant = json.data
        .flatMap((p: { variants: (Movement & { id: string })[] }) => p.variants)
        .find((x: { id: string }) => false); // movements not embedded — use filter below
    }
    // Fallback: query movements through audit? Keep it direct:
    const mres = await fetch(`/api/admin/inventory/${v.id}/movements`).catch(() => null);
    if (mres && mres.ok) {
      const mjson = await mres.json();
      setMovements(mjson.ok ? mjson.data : []);
    } else {
      setMovements([]);
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

  const filtered = rows?.filter(
    (r) =>
      !q ||
      r.sku.toLowerCase().includes(q.toLowerCase()) ||
      r.product.name.toLowerCase().includes(q.toLowerCase())
  );

  if (!rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-medium">Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stock on hand per variant. Every adjustment is recorded in stock movement history.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU or product…" className="pl-9" />
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
              const low = v.stock <= v.lowStockThreshold;
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
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAdjusting(v)}>
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
            <div>
              <Label htmlFor="delta">Change (+ to add, − to remove)</Label>
              <Input id="delta" name="delta" type="number" placeholder="e.g. 10 or -3" required autoFocus />
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
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : movements.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No movements recorded.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="font-medium">
                      {m.delta > 0 ? "+" : ""}
                      {m.delta}{" "}
                      <span className="text-xs font-normal text-muted-foreground">({m.reason})</span>
                    </p>
                    {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
                    {m.reference && (
                      <p className="text-xs text-muted-foreground">Ref: {m.reference}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

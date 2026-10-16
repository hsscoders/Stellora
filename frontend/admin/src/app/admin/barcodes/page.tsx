"use client";

import JsBarcode from "jsbarcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Barcode,
  CheckSquare,
  Loader2,
  PackageOpen,
  Printer,
  RefreshCw,
  Search,
  Square,
} from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/utils";

/* ------------------------------ API shapes ------------------------------ */

interface ApiVariant {
  id: string;
  name: string;
  sku: string;
  price: number | string;
  isActive: boolean;
}

interface ApiProduct {
  id: string;
  slug: string;
  name: string;
  variants: ApiVariant[];
}

interface LabelItem {
  key: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  price: number;
}

/* Label sizes map to common thermal/roll label stocks (A4 sheet friendly). */
const LABEL_SIZES = {
  sm: { id: "sm", label: "Small · 38 × 25 mm", boxW: "38mm", boxH: "25mm", nameCls: "text-[7px]", subCls: "text-[6px]", barH: 20, footCls: "text-[6px]" },
  md: { id: "md", label: "Medium · 50 × 30 mm", boxW: "50mm", boxH: "30mm", nameCls: "text-[8px]", subCls: "text-[7px]", barH: 28, footCls: "text-[7px]" },
  lg: { id: "lg", label: "Large · 60 × 40 mm", boxW: "60mm", boxH: "40mm", nameCls: "text-[9px]", subCls: "text-[7px]", barH: 38, footCls: "text-[8px]" },
} as const;

type LabelSizeId = keyof typeof LABEL_SIZES;

const MAX_LABELS = 400;

/* ------------------------------ barcode svg ------------------------------ */

function BarcodeSvg({ sku, height }: { sku: string; height: number }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, sku, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height,
        width: 1.2,
        lineColor: "#000000",
      });
    } catch {
      /* invalid SKU charset — leave the label empty rather than crash */
    }
  }, [sku, height]);
  return <svg ref={ref} className="max-w-full" />;
}

/* ------------------------------ page ------------------------------ */

export default function AdminBarcodesPage() {
  const router = useRouter();

  const [products, setProducts] = useState<ApiProduct[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sizeId, setSizeId] = useState<LabelSizeId>("md");
  const [copies, setCopies] = useState("1");
  const [showPrice, setShowPrice] = useState(true);
  const [loading, setLoading] = useState(false);

  /* Pull the whole ACTIVE catalog once (paginated loop over the public API). */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      let acc: ApiProduct[] = [];
      let page = 1;
      let pages = 1;
      do {
        const res = await fetch(`/api/products?page=${page}`, { cache: "no-store" });
        const json = await res.json();
        if (!json.ok) {
          toast.error(json.error?.message ?? "Could not load products");
          break;
        }
        const d = json.data as { products: ApiProduct[]; pages: number };
        acc = acc.concat(d.products);
        pages = d.pages;
        page += 1;
      } while (page <= pages && acc.length < 800);

      setProducts(acc);
      const ids: string[] = [];
      for (const p of acc) {
        for (const v of p.variants) {
          if (v.isActive) ids.push(v.id);
        }
      }
      setSelected(new Set(ids));
    } catch {
      toast.error("Network error while loading products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const copiesNum = Math.min(Math.max(Math.round(Number(copies) || 1), 1), 12);
  const size = LABEL_SIZES[sizeId];

  /* Build the physical label sheet: selection × filter × copies. */
  const labels = useMemo(() => {
    const out: LabelItem[] = [];
    const q = query.trim().toLowerCase();
    if (!products) return out;
    for (const p of products) {
      for (const v of p.variants) {
        if (!v.isActive) continue;
        if (!selected.has(v.id)) continue;
        if (q && !`${p.name} ${v.name} ${v.sku}`.toLowerCase().includes(q)) continue;
        for (let i = 0; i < copiesNum; i += 1) {
          out.push({
            key: `${v.id}-${i}`,
            variantId: v.id,
            productName: p.name,
            variantName: v.name,
            sku: v.sku,
            price: Number(v.price),
          });
        }
      }
    }
    return out.slice(0, MAX_LABELS);
  }, [products, selected, query, copiesNum]);

  const totalLabelable = useMemo(() => {
    const q = query.trim().toLowerCase();
    let n = 0;
    if (!products) return 0;
    for (const p of products) {
      for (const v of p.variants) {
        if (!v.isActive) continue;
        if (q && !`${p.name} ${v.name} ${v.sku}`.toLowerCase().includes(q)) continue;
        n += 1;
      }
    }
    return n;
  }, [products, query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!products) return [];
    return products
      .map((p) => ({ p, vs: p.variants.filter((v) => v.isActive) }))
      .filter(
        ({ p, vs }) =>
          vs.length > 0 && (!q || `${p.name} ${vs.map((v) => v.sku).join(" ")}`.toLowerCase().includes(q))
      );
  }, [products, query]);

  function toggleVariant(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    if (!products) return;
    const q = query.trim().toLowerCase();
    const ids: string[] = [];
    for (const p of products) {
      for (const v of p.variants) {
        if (!v.isActive) continue;
        if (q && !`${p.name} ${v.name} ${v.sku}`.toLowerCase().includes(q)) continue;
        ids.push(v.id);
      }
    }
    setSelected(new Set(ids));
  }

  return (
    <div className="space-y-6">
      {/* print: only the label sheet is visible on paper */}
      <style>{`@media print{body *{visibility:hidden}.label-sheet,.label-sheet *{visibility:visible}.label-sheet{position:absolute;inset:0;background:#fff}.no-print{display:none !important}@page{margin:4mm}}`}</style>

      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Barcode className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-medium sm:text-3xl">Barcode Labels</h1>
          <p className="text-sm text-muted-foreground">
            Print CODE128 price labels for every product — then scan them at the POS.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => void fetchAll()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => router.push("/admin/pos")}>
            Back to POS
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        {/* LEFT — controls + selection */}
        <section className="no-print space-y-4">
          <div className="space-y-3 rounded-lg border border-border/70 bg-card p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter products / SKUs…"
                className="pl-9"
                aria-label="Filter label selection"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="label-size">Label size</Label>
                <select
                  id="label-size"
                  value={sizeId}
                  onChange={(e) => setSizeId(e.target.value as LabelSizeId)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {(Object.keys(LABEL_SIZES) as LabelSizeId[]).map((k) => (
                    <option key={k} value={k}>
                      {LABEL_SIZES[k].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="label-copies">Labels per variant</Label>
                <Input
                  id="label-copies"
                  type="number"
                  min={1}
                  max={12}
                  value={copies}
                  onChange={(e) => setCopies(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={showPrice ? "default" : "outline"}
                size="sm"
                className="rounded-full text-xs"
                aria-pressed={showPrice}
                onClick={() => setShowPrice((s) => !s)}
              >
                {showPrice ? "Price shown" : "Price hidden"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full text-xs"
                onClick={selectAllFiltered}
              >
                <CheckSquare className="h-3.5 w-3.5" /> Select all filtered ({totalLabelable})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full text-xs"
                onClick={() => setSelected(new Set())}
              >
                <Square className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-2.5">
              <p className="text-xs text-muted-foreground">
                {labels.length} label{labels.length === 1 ? "" : "s"} on sheet
                {labels.length >= MAX_LABELS ? " (capped)" : ""}
              </p>
              <Button size="sm" className="rounded-full" disabled={labels.length === 0} onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>
          </div>

          {/* selection list */}
          <div className="rounded-lg border border-border/70 bg-card">
            <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Products ({filtered.length})
            </p>
            <div className="stellora-scroll max-h-[420px] overflow-y-auto">
              {loading && products === null ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-8 text-center">
                  <PackageOpen className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm">No products match the filter.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map(({ p, vs }) => (
                    <li key={p.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{p.name}</p>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {vs.length} variant{vs.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {vs.map((v) => {
                          const on = selected.has(v.id);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleVariant(v.id)}
                              className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition ${
                                on
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:bg-accent"
                              }`}
                            >
                              {v.sku}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT — the printable sheet */}
        <section className="min-w-0">
          {labels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-20 text-center">
              <Barcode className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No labels selected</p>
              <p className="text-xs text-muted-foreground">
                Pick variants on the left — every selected SKU gets a CODE128 label.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <p className="no-print mb-3 text-xs text-muted-foreground">
                Preview — what you see is exactly what prints, one box per label.
              </p>
              <div className="label-sheet flex flex-wrap gap-2">
                {labels.map((item) => (
                  <div
                    key={item.key}
                    className="flex shrink-0 items-center justify-center border border-neutral-300 bg-white"
                    style={{ width: size.boxW, height: size.boxH }}
                  >
                    <div className="flex h-full w-full flex-col items-center justify-between overflow-hidden p-1 text-black">
                      <div className="w-full text-center leading-tight">
                        <p className={`truncate font-semibold ${size.nameCls}`}>{item.productName}</p>
                        <p className={`truncate ${size.subCls}`}>
                          {item.variantName}
                          {showPrice ? ` · ${formatINR(item.price)}` : ""}
                        </p>
                      </div>
                      <BarcodeSvg sku={item.sku} height={size.barH} />
                      <p className={`w-full text-center font-mono leading-none ${size.footCls}`}>{item.sku}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
